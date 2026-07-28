import { eq } from 'drizzle-orm';
import { enterpriseProcedure } from '../../auth/enterprise';
import { webhookEndpoints } from '../../db/schema';

export const listWebhookEndpoints = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/',
        summary: 'List client webhook endpoints',
    })
    .handler(async ({ context: { db, enterprise } }) => ({
        endpoints: await db
            .select({
                id: webhookEndpoints.id,
                url: webhookEndpoints.url,
                events: webhookEndpoints.events,
                active: webhookEndpoints.active,
                createdAt: webhookEndpoints.createdAt,
                updatedAt: webhookEndpoints.updatedAt,
            })
            .from(webhookEndpoints)
            .where(eq(webhookEndpoints.enterpriseId, enterprise.id)),
    }));
