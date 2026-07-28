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
                scheme: enterpriseEndpoints.scheme,
                value: enterpriseEndpoints.value,
            })
            .from(enterpriseEndpoints)
            .where(eq(enterpriseEndpoints.enterpriseId, enterprise.id));
        return {
            ...enterprise,
            endpoints: endpoints.map(({ scheme, value }) => ({
                scheme,
                value,
                canonical: `${scheme}:${value}`,
            })),
        };
    });
