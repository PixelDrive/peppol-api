import { eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import { getConfig } from '../../config';
import { documents } from '../../db/schema';
import { assertSenderBelongsToEnterprise } from '../../peppol/authorization';
import { validateWithKosit } from '../../peppol/validation';
import { parseUblDocument } from '../../peppol/xml';
import { getProvider } from '../../providers/factory';
import { emitWebhookEvent } from '../../webhooks/delivery';

export const sendDocument = enterpriseProcedure
    .route({
        method: 'POST',
        path: '/send',
        summary: 'Send a UBL document over Peppol',
        description:
            'Authorizes the supplier participant identifier, derives the sender country from the final XML, validates with KoSIT, then delegates transport to the configured provider.',
    })
    .input(
        z.object({
            ublXml: z.string().min(1).max(5_000_000),
            externalReference: z.string().trim().max(200).optional(),
            validate: z.boolean().optional(),
        })
    )
    .handler(async ({ context: { db, enterprise, logger }, input }) => {
        const metadata = parseUblDocument(input.ublXml);
        await assertSenderBelongsToEnterprise(
            db,
            enterprise.id,
            metadata.senderEndpoint
        );

        const [document] = await db
            .insert(documents)
            .values({
                enterpriseId: enterprise.id,
                type: metadata.type,
                direction: 'OUTGOING',
                status: 'VALIDATING',
                senderEndpoint: metadata.senderEndpoint,
                receiverEndpoint: metadata.receiverEndpoint,
                externalReference: input.externalReference,
                ublXml: input.ublXml,
            })
            .returning();

        try {
            if (input.validate ?? getConfig().VALIDATE_BEFORE_SEND) {
                const validation = await validateWithKosit(input.ublXml);
                if (!validation.valid) {
                    await db
                        .update(documents)
                        .set({
                            status: 'INVALID',
                            errorMessage: validation.errors
                                .map((error) => error.text)
                                .join('\n'),
                            updatedAt: new Date(),
                        })
                        .where(eq(documents.id, document!.id));
                    await emitWebhookEvent(
                        db,
                        enterprise.id,
                        'document.invalid',
                        document!.id,
                        { errors: validation.errors }
                    );
                    throw new ORPCError('BAD_REQUEST', {
                        message: 'The UBL document is not Peppol compliant',
                        data: {
                            errors: validation.errors,
                            warnings: validation.warnings,
                        },
                    });
                }
            }

            const provider = await getProvider(db, enterprise);
            const result = await provider.sendDocument({
                ublXml: input.ublXml,
                type: metadata.type,
                senderEndpoint: metadata.senderEndpoint,
                receiverEndpoint: metadata.receiverEndpoint,
                senderCountryCode: metadata.senderCountryCode,
                externalReference: document!.id,
            });
            await db
                .update(documents)
                .set({
                    status: result.status,
                    providerDocumentId: result.providerDocumentId,
                    updatedAt: new Date(),
                })
                .where(eq(documents.id, document!.id));

            const event =
                result.status === 'SENT'
                    ? ('document.sent' as const)
                    : ('document.pending' as const);
            await emitWebhookEvent(db, enterprise.id, event, document!.id, {
                status: result.status,
                senderEndpoint: metadata.senderEndpoint,
                receiverEndpoint: metadata.receiverEndpoint,
                externalReference: input.externalReference,
            });

            return {
                id: document!.id,
                status: result.status,
                provider: provider.name,
                providerDocumentId: result.providerDocumentId,
                ...metadata,
            };
        } catch (error) {
            if (error instanceof ORPCError && error.code === 'BAD_REQUEST') {
                throw error;
            }
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            logger.error(
                {
                    error,
                    documentId: document!.id,
                    enterpriseId: enterprise.id,
                },
                'Peppol document submission failed'
            );
            await db
                .update(documents)
                .set({
                    status: 'FAILED',
                    errorMessage,
                    updatedAt: new Date(),
                })
                .where(eq(documents.id, document!.id));
            await emitWebhookEvent(
                db,
                enterprise.id,
                'document.failed',
                document!.id,
                { error: errorMessage }
            );
            throw new ORPCError('INTERNAL_SERVER_ERROR', {
                message: 'Peppol provider submission failed',
                cause: error,
            });
        }
    });
