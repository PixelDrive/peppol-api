import { eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { adminProcedure } from '../../../auth/admin';
import {
    enterpriseApiKeys,
    enterpriseEndpoints,
    enterprises,
    providerCredentials,
} from '../../../db/schema';

export const getEnterprise = adminProcedure
    .route({
        method: 'GET',
        path: '/{enterpriseId}',
        summary: 'Get an enterprise',
    })
    .input(z.object({ enterpriseId: z.uuid() }))
    .handler(async ({ context: { db }, input }) => {
        const [enterprise] = await db
            .select()
            .from(enterprises)
            .where(eq(enterprises.id, input.enterpriseId))
            .limit(1);
        if (!enterprise) {
            throw new ORPCError('NOT_FOUND');
        }

        const [endpoints, apiKeys, credentials] = await Promise.all([
            db
                .select()
                .from(enterpriseEndpoints)
                .where(
                    eq(enterpriseEndpoints.enterpriseId, input.enterpriseId)
                ),
            db
                .select({
                    id: enterpriseApiKeys.id,
                    prefix: enterpriseApiKeys.prefix,
                    active: enterpriseApiKeys.active,
                    lastUsedAt: enterpriseApiKeys.lastUsedAt,
                    expiresAt: enterpriseApiKeys.expiresAt,
                    createdAt: enterpriseApiKeys.createdAt,
                })
                .from(enterpriseApiKeys)
                .where(eq(enterpriseApiKeys.enterpriseId, input.enterpriseId)),
            db
                .select({
                    provider: providerCredentials.provider,
                    createdAt: providerCredentials.createdAt,
                    updatedAt: providerCredentials.updatedAt,
                })
                .from(providerCredentials)
                .where(
                    eq(providerCredentials.enterpriseId, input.enterpriseId)
                ),
        ]);

        return {
            ...enterprise,
            endpoints: endpoints.map(({ scheme, value }) => ({
                scheme,
                value,
                canonical: `${scheme}:${value}`,
            })),
            apiKeys,
            configuredProviders: credentials,
        };
    });
