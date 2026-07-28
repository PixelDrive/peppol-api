import { enterpriseProcedure } from '../../auth/enterprise';
import { createWebhookEndpoint } from './create-webhook-endpoint';
import { deleteWebhookEndpoint } from './delete-webhook-endpoint';
import { listWebhookDeliveries } from './list-webhook-deliveries';
import { listWebhookEndpoints } from './list-webhook-endpoints';

export const webhookEndpointsRouter = enterpriseProcedure
    .prefix('/webhook-endpoints')
    .tag('Webhooks')
    .router({
        create: createWebhookEndpoint,
        list: listWebhookEndpoints,
        delete: deleteWebhookEndpoint,
        deliveries: listWebhookDeliveries,
    });
