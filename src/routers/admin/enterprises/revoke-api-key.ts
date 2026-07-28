import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseApiKeys } from '../../../db/schema';

export const revokeApiKey = adminProcedure
    .route({
        method: 'DELETE',
        path: '/{enterpriseId}/api-keys/{apiKeyId}',
        summary: 'Revoke an enterprise API key',
    })
    .input(
        z.object({
            enterpriseId: z.uuid(),
            apiKeyId: z.uuid(),
        })
    )
    .handler(async ({ context: { db }, input }) => {
        await db
            .update(enterpriseApiKeys)
            .set({ active: false })
            .where(
                and(
                    eq(enterpriseApiKeys.id, input.apiKeyId),
                    eq(enterpriseApiKeys.enterpriseId, input.enterpriseId)
                )
            );
        return { success: true };
    });
