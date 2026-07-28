import { encrypt } from '../../../lib/crypto';
import { adminProcedure } from '../../../auth/admin';
import {
    enterpriseApiKeys,
    enterpriseEndpoints,
    enterprises,
    providerCredentials,
} from '../../../db/schema';
import { generateApiKey } from '../../../lib/api-keys';
import { toBelgianPeppolEndpoint } from '../../../lib/peppol-endpoint';
import { enterpriseInputSchema } from './schemas';

export const createEnterprise = adminProcedure
    .route({
        method: 'POST',
        path: '/',
        summary: 'Create an enterprise',
        description:
            'Creates an isolated enterprise, its Belgian Peppol EndpointID and its first API key.',
    })
    .input(enterpriseInputSchema)
    .handler(async ({ context: { db }, input }) => {
        const endpoint = toBelgianPeppolEndpoint(
            input.companyNumber ?? input.vatNumber!
        );
        const generatedKey = await generateApiKey();

        const enterprise = await db.transaction(async (transaction) => {
            const [created] = await transaction
                .insert(enterprises)
                .values({
                    name: input.name,
                    companyNumber: endpoint.value,
                    vatNumber: input.vatNumber
                        ? `BE${endpoint.value}`
                        : undefined,
                    provider: input.provider,
                    useGlobalProviderCredentials:
                        input.useGlobalProviderCredentials,
                })
                .returning();

            await transaction.insert(enterpriseEndpoints).values({
                enterpriseId: created!.id,
                scheme: endpoint.scheme,
                value: endpoint.value,
            });
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
                endpointId: endpoint.canonical,
            },
            apiKey: generatedKey.apiKey,
            warning:
                'This API key is only returned once. Store it in a secret manager.',
        };
    });
