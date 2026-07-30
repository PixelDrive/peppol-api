import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseApiKeys } from '../../../db/schema';

export const enterpriseApiKeySummarySelection = {
    id: enterpriseApiKeys.id,
    prefix: enterpriseApiKeys.prefix,
    active: enterpriseApiKeys.active,
    lastUsedAt: enterpriseApiKeys.lastUsedAt,
    expiresAt: enterpriseApiKeys.expiresAt,
    createdAt: enterpriseApiKeys.createdAt,
} as const;

export const listApiKeys = adminProcedure
    .route({
        method: 'GET',
        path: '/{enterpriseId}/api-keys',
        summary: 'List enterprise API keys',
        description:
            'Returns API key metadata for one enterprise without exposing key hashes or secret values.',
    })
    .input(z.object({ enterpriseId: z.uuid() }))
    .handler(async ({ context: { db }, input }) => {
        const apiKeys = await db
            .select(enterpriseApiKeySummarySelection)
            .from(enterpriseApiKeys)
            .where(eq(enterpriseApiKeys.enterpriseId, input.enterpriseId))
            .orderBy(desc(enterpriseApiKeys.createdAt));

        return { apiKeys };
    });
