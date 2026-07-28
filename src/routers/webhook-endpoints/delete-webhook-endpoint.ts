import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import { webhookEndpoints } from '../../db/schema';

export const deleteWebhookEndpoint = enterpriseProcedure
    .route({
        method: 'DELETE',
        path: '/{webhookEndpointId}',
        summary: 'Delete a client webhook endpoint',
    })
    .input(z.object({ webhookEndpointId: z.uuid() }))
    .handler(async ({ context: { db, enterprise }, input }) => {
        await db
            .delete(webhookEndpoints)
            .where(
                and(
                    eq(webhookEndpoints.id, input.webhookEndpointId),
                    eq(webhookEndpoints.enterpriseId, enterprise.id)
                )
            );
        return { success: true };
    });
