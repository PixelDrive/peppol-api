import { asc, eq } from 'drizzle-orm';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseEndpoints, enterprises } from '../../../db/schema';

export const listEnterprises = adminProcedure
    .route({
        method: 'GET',
        path: '/',
        summary: 'List enterprises',
    })
    .handler(async ({ context: { db } }) => {
        const rows = await db
            .select({
                enterprise: enterprises,
                endpointScheme: enterpriseEndpoints.scheme,
                endpointValue: enterpriseEndpoints.value,
            })
            .from(enterprises)
            .innerJoin(
                enterpriseEndpoints,
                eq(enterpriseEndpoints.enterpriseId, enterprises.id)
            )
            .orderBy(asc(enterprises.name));

        return {
            enterprises: rows.map((row) => ({
                ...row.enterprise,
                endpointId: `${row.endpointScheme}:${row.endpointValue}`,
            })),
        };
    });
