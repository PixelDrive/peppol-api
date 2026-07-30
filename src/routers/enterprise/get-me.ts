import { eq } from 'drizzle-orm';
import { enterpriseProcedure } from '../../auth/enterprise';
import { enterpriseEndpoints } from '../../db/schema';

export const getMe = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/me',
        summary: 'Get authenticated enterprise',
    })
    .handler(async ({ context: { db, enterprise } }) => {
        const endpoints = await db
            .select({
                id: enterpriseEndpoints.id,
                scheme: enterpriseEndpoints.scheme,
                value: enterpriseEndpoints.value,
                createdAt: enterpriseEndpoints.createdAt,
            })
            .from(enterpriseEndpoints)
            .where(eq(enterpriseEndpoints.enterpriseId, enterprise.id));
        return {
            ...enterprise,
            participantIdentifiers: endpoints.map(
                ({ id, scheme, value, createdAt }) => ({
                    id,
                    scheme,
                    value,
                    canonical: `${scheme}:${value}`,
                    createdAt,
                })
            ),
            endpoints: endpoints.map(({ id, scheme, value, createdAt }) => ({
                id,
                scheme,
                value,
                canonical: `${scheme}:${value}`,
                createdAt,
            })),
        };
    });
