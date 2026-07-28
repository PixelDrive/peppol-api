import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import { webhookDeliveries, webhookEndpoints } from '../../db/schema';

export const listWebhookDeliveries = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/deliveries',
        summary: 'List webhook delivery attempts',
    })
    .input(
        z.object({
            limit: z.coerce.number().int().min(1).max(100).default(50),
        })
    )
    .handler(async ({ context: { db, enterprise }, input }) => ({
        deliveries: await db
            .select({
                id: webhookDeliveries.id,
                endpointId: webhookDeliveries.webhookEndpointId,
                event: webhookDeliveries.event,
                status: webhookDeliveries.status,
                attempts: webhookDeliveries.attempts,
                responseStatus: webhookDeliveries.responseStatus,
                errorMessage: webhookDeliveries.errorMessage,
                nextAttemptAt: webhookDeliveries.nextAttemptAt,
                deliveredAt: webhookDeliveries.deliveredAt,
                createdAt: webhookDeliveries.createdAt,
            })
            .from(webhookDeliveries)
            .innerJoin(
                webhookEndpoints,
                and(
                    eq(
                        webhookEndpoints.id,
                        webhookDeliveries.webhookEndpointId
                    ),
                    eq(webhookEndpoints.enterpriseId, enterprise.id)
                )
            )
            .orderBy(desc(webhookDeliveries.createdAt))
            .limit(input.limit),
    }));
