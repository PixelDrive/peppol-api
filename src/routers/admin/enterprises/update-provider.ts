import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { adminProcedure } from '../../../auth/admin';
import { enterprises, providerCredentials } from '../../../db/schema';
import { encrypt } from '../../../lib/crypto';
import { dokapiCredentialsSchema } from './schemas';

export const updateProvider = adminProcedure
    .route({
        method: 'PUT',
        path: '/{enterpriseId}/provider',
        summary: 'Configure the enterprise Peppol provider',
    })
    .input(
        z
            .object({
                enterpriseId: z.uuid(),
                provider: z.literal('DOKAPI'),
                useGlobalProviderCredentials: z.boolean(),
                credentials: dokapiCredentialsSchema.optional(),
            })
            .superRefine((value, context) => {
                if (!value.useGlobalProviderCredentials && !value.credentials) {
                    context.addIssue({
                        code: 'custom',
                        path: ['credentials'],
                        message:
                            'credentials are required when global credentials are disabled',
                    });
                }
            })
    )
    .handler(async ({ context: { db }, input }) => {
        await db.transaction(async (transaction) => {
            await transaction
                .update(enterprises)
                .set({
                    provider: input.provider,
                    useGlobalProviderCredentials:
                        input.useGlobalProviderCredentials,
                    updatedAt: new Date(),
                })
                .where(eq(enterprises.id, input.enterpriseId));

            if (input.credentials) {
                await transaction
                    .insert(providerCredentials)
                    .values({
                        enterpriseId: input.enterpriseId,
                        provider: input.provider,
                        encryptedCredentials: encrypt(
                            JSON.stringify(input.credentials)
                        ),
                    })
                    .onConflictDoUpdate({
                        target: [
                            providerCredentials.enterpriseId,
                            providerCredentials.provider,
                        ],
                        set: {
                            encryptedCredentials: encrypt(
                                JSON.stringify(input.credentials)
                            ),
                            updatedAt: new Date(),
                        },
                    });
            } else if (input.useGlobalProviderCredentials) {
                await transaction
                    .delete(providerCredentials)
                    .where(
                        and(
                            eq(
                                providerCredentials.enterpriseId,
                                input.enterpriseId
                            ),
                            eq(providerCredentials.provider, input.provider)
                        )
                    );
            }
        });

        return { success: true };
    });
