import { ORPCError } from '@orpc/server';
import { encrypt } from '../../../lib/crypto';
import { adminProcedure } from '../../../auth/admin';
import {
    enterpriseApiKeys,
    enterpriseEndpoints,
    enterprises,
    providerCredentials,
} from '../../../db/schema';
import { generateApiKey } from '../../../lib/api-keys';
import {
    enterpriseInputSchema,
    resolveEnterpriseParticipantIdentifiers,
} from './schemas';

export const createEnterprise = adminProcedure
    .route({
        method: 'POST',
        path: '/',
        summary: 'Create an enterprise',
        description:
            'Creates an isolated enterprise, registers its primary and additional Peppol participant identifiers, and returns its first API key.',
    })
    .input(enterpriseInputSchema)
    .handler(async ({ context: { db }, input }) => {
        const participantIdentifiers =
            resolveEnterpriseParticipantIdentifiers(input);
        const primaryParticipantIdentifier = participantIdentifiers[0]!;
        const generatedKey = await generateApiKey();

        const enterprise = await db.transaction(async (transaction) => {
            const [created] = await transaction
                .insert(enterprises)
                .values({
                    name: input.name,
                    companyNumber:
                        input.companyNumber ??
                        (input.participantId
                            ? undefined
                            : primaryParticipantIdentifier.value),
                    vatNumber:
                        input.vatNumber && !input.participantId
                            ? `BE${primaryParticipantIdentifier.value}`
                            : input.vatNumber,
                    provider: input.provider,
                    useGlobalProviderCredentials:
                        input.useGlobalProviderCredentials,
                })
                .returning();

            const insertedParticipantIdentifiers = await transaction
                .insert(enterpriseEndpoints)
                .values(
                    participantIdentifiers.map(({ scheme, value }) => ({
                        enterpriseId: created!.id,
                        scheme,
                        value,
                    }))
                )
                .onConflictDoNothing()
                .returning({ id: enterpriseEndpoints.id });
            if (
                insertedParticipantIdentifiers.length !==
                participantIdentifiers.length
            ) {
                throw new ORPCError('CONFLICT', {
                    message:
                        'At least one participant identifier is already registered to another enterprise.',
                });
            }
            await transaction.insert(enterpriseApiKeys).values({
                enterpriseId: created!.id,
                prefix: generatedKey.prefix,
                keyHash: generatedKey.hash,
            });

            if (input.providerCredentials) {
                await transaction.insert(providerCredentials).values({
                    enterpriseId: created!.id,
                    provider: input.provider,
                    encryptedCredentials: encrypt(
                        JSON.stringify(input.providerCredentials)
                    ),
                });
            }

            return created!;
        });

        return {
            enterprise: {
                ...enterprise,
                endpointId: primaryParticipantIdentifier.canonical,
                participantIdentifiers,
            },
            apiKey: generatedKey.apiKey,
            warning:
                'This API key is only returned once. Store it in a secret manager.',
        };
    });
