import { Queue, type JobsOptions } from 'bullmq';
import { getConfig } from '../config';
import { createRedisConnection } from './redis';

export const webhookDeliveryQueueName = 'webhook-deliveries';
export const webhookDeliveryJobName = 'deliver-client-webhook';

export type WebhookDeliveryJobData = {
    deliveryId: string;
};

let queue: Queue | undefined;
let producerConnection: ReturnType<typeof createRedisConnection> | undefined;

export function webhookDeliveryJobOptions(deliveryId: string): JobsOptions {
    return {
        jobId: deliveryId,
        attempts: getConfig().WEBHOOK_MAX_ATTEMPTS,
        backoff: {
            type: 'exponential',
            delay: getConfig().WEBHOOK_RETRY_BASE_DELAY_MS,
        },
        removeOnComplete: {
            age: 24 * 60 * 60,
            count: 10_000,
        },
        removeOnFail: {
            age: 7 * 24 * 60 * 60,
            count: 10_000,
        },
    };
}

function getWebhookDeliveryQueue(): Queue {
    producerConnection ??= createRedisConnection(
        'peppol-webhook-queue-producer'
    );
    queue ??= new Queue(webhookDeliveryQueueName, {
        connection: producerConnection,
        defaultJobOptions: {
            attempts: getConfig().WEBHOOK_MAX_ATTEMPTS,
            backoff: {
                type: 'exponential',
                delay: getConfig().WEBHOOK_RETRY_BASE_DELAY_MS,
            },
        },
    });
    return queue;
}

/**
 * Enqueues one durable delivery. The database UUID is also the BullMQ job ID,
 * making reconciliation idempotent.
 */
export async function enqueueWebhookDelivery(
    deliveryId: string
): Promise<void> {
    await getWebhookDeliveryQueue().add(
        webhookDeliveryJobName,
        { deliveryId },
        webhookDeliveryJobOptions(deliveryId)
    );
}

export async function closeWebhookDeliveryQueue(): Promise<void> {
    await queue?.close();
    await producerConnection?.quit();
    queue = undefined;
    producerConnection = undefined;
}
