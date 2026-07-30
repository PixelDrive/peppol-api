import { eq } from 'drizzle-orm';
import { enterpriseProcedure } from '../../auth/enterprise';
import { webhookEndpoints } from '../../db/schema';
import { listWebhookEndpointsOutputSchema } from '../output-schemas';

export const listWebhookEndpoints = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/',
        summary: 'List client webhook endpoints',
    })
    .output(listWebhookEndpointsOutputSchema)
    .handler(async ({ context: { db, enterprise } }) => {
        const endpoints = await db
            .select({
                id: webhookEndpoints.id,
                url: webhookEndpoints.url,
                events: webhookEndpoints.events,
                active: webhookEndpoints.active,
                createdAt: webhookEndpoints.createdAt,
                updatedAt: webhookEndpoints.updatedAt,
            })
            .from(webhookEndpoints)
            .where(eq(webhookEndpoints.enterpriseId, enterprise.id));

        return listWebhookEndpointsOutputSchema.parse({ endpoints });
    });
