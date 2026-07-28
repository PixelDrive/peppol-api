import { z } from 'zod';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseApiKeys } from '../../../db/schema';
import { generateApiKey } from '../../../lib/api-keys';

export const createApiKey = adminProcedure
    .route({
        method: 'POST',
        path: '/{enterpriseId}/api-keys',
        summary: 'Create another enterprise API key',
    })
    .input(
        z.object({
            enterpriseId: z.uuid(),
            expiresAt: z.iso.datetime().optional(),
        })
    )
    .handler(async ({ context: { db }, input }) => {
        const generated = await generateApiKey();
        const [apiKey] = await db
            .insert(enterpriseApiKeys)
            .values({
                enterpriseId: input.enterpriseId,
                prefix: generated.prefix,
                keyHash: generated.hash,
                expiresAt: input.expiresAt
                    ? new Date(input.expiresAt)
                    : undefined,
            })
            .returning({
                id: enterpriseApiKeys.id,
                prefix: enterpriseApiKeys.prefix,
                expiresAt: enterpriseApiKeys.expiresAt,
                createdAt: enterpriseApiKeys.createdAt,
            });
        return {
            ...apiKey!,
            apiKey: generated.apiKey,
            warning:
                'This API key is only returned once. Store it in a secret manager.',
        };
    });
