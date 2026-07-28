import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import { assertSenderBelongsToEnterprise } from '../../peppol/authorization';
import { validateWithKosit } from '../../peppol/validation';
import { parseUblDocument } from '../../peppol/xml';

export const validateDocument = enterpriseProcedure
    .route({
        method: 'POST',
        path: '/validate',
        summary: 'Validate UBL with KoSIT',
        description:
            'Checks tenant ownership of the supplier EndpointID, then validates independently from the Peppol provider.',
    })
    .input(z.object({ ublXml: z.string().min(1).max(5_000_000) }))
    .handler(async ({ context: { db, enterprise }, input }) => {
        const metadata = parseUblDocument(input.ublXml);
        await assertSenderBelongsToEnterprise(
            db,
            enterprise.id,
            metadata.senderEndpoint
        );
        const result = await validateWithKosit(input.ublXml);
        if (!result.valid) {
            throw new ORPCError('BAD_REQUEST', {
                message: 'The UBL document is not Peppol compliant',
                data: {
                    errors: result.errors,
                    warnings: result.warnings,
                },
            });
        }
        return {
            valid: true,
            errors: result.errors,
            warnings: result.warnings,
            document: metadata,
        };
    });
