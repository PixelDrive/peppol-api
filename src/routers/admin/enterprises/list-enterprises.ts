import { asc } from 'drizzle-orm';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseEndpoints, enterprises } from '../../../db/schema';

export const listEnterprises = adminProcedure
    .route({
        method: 'GET',
        path: '/',
        summary: 'List enterprises',
    })
    .handler(async ({ context: { db } }) => {
        const [enterpriseRows, participantIdentifierRows] = await Promise.all([
            db.select().from(enterprises).orderBy(asc(enterprises.name)),
            db
                .select()
                .from(enterpriseEndpoints)
                .orderBy(asc(enterpriseEndpoints.createdAt)),
        ]);

        return {
            enterprises: enterpriseRows.map((enterprise) => {
                const participantIdentifiers = participantIdentifierRows
                    .filter(
                        ({ enterpriseId }) => enterpriseId === enterprise.id
                    )
                    .map(({ id, scheme, value, createdAt }) => ({
                        id,
                        scheme,
                        value,
                        canonical: `${scheme}:${value}`,
                        createdAt,
                    }));
                return {
                    ...enterprise,
                    endpointId: participantIdentifiers[0]?.canonical,
                    participantIdentifiers,
                };
            }),
        };
    });
