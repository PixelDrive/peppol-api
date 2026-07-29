import '@dotenvx/dotenvx/config';
import { Worker } from 'bullmq';
import { getConfig } from '../config';
import { db } from '../db/client';
import { migrateDatabase } from '../db/migrate';
import { logger } from '../lib/logger';
import {
    closeWebhookDeliveryQueue,
    webhookDeliveryQueueName,
    type WebhookDeliveryJobData,
} from '../queues/webhook-deliveries';
import { createRedisConnection } from '../queues/redis';
import {
    deliverWebhookJob,
    reconcilePendingWebhookDeliveries,
} from '../webhooks/delivery';

async function main(): Promise<void> {
    const config = getConfig();
    if (config.RUN_MIGRATIONS) {
        await migrateDatabase(db);
    }

    const workerConnection = createRedisConnection(
        'peppol-webhook-delivery-worker',
        'worker'
    );
    const worker = new Worker(
        webhookDeliveryQueueName,
        async (job) => {
            const data = job.data as WebhookDeliveryJobData;
            await deliverWebhookJob(
                db,
                data.deliveryId,
                job.attemptsMade + 1,
                job.opts.attempts ?? config.WEBHOOK_MAX_ATTEMPTS
            );
        },
        {
            connection: workerConnection,
            concurrency: config.WEBHOOK_QUEUE_CONCURRENCY,
        }
    );

    worker.on('error', (error) => {
        logger.error({ error }, 'BullMQ webhook worker error');
    });
    worker.on('failed', (job, error) => {
        logger.warn(
            {
                jobId: job?.id,
                deliveryId: job?.data.deliveryId,
                attemptsMade: job?.attemptsMade,
                error,
            },
            'BullMQ webhook job failed'
        );
    });

    await reconcilePendingWebhookDeliveries(db);
    const reconcileInterval = setInterval(() => {
        reconcilePendingWebhookDeliveries(db).catch((error: unknown) => {
            logger.error({ error }, 'Webhook outbox reconciliation failed');
        });
    }, config.WEBHOOK_RECONCILE_INTERVAL_MS);

    let shuttingDown = false;
    const shutdown = async (signal: string): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        clearInterval(reconcileInterval);
        logger.info({ signal }, 'Stopping webhook worker');
        await worker.close();
        await closeWebhookDeliveryQueue();
        await workerConnection.quit();
    };

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            shutdown(signal)
                .then(() => {
                    process.exitCode = 0;
                })
                .catch((error: unknown) => {
                    logger.error({ error }, 'Webhook worker shutdown failed');
                    process.exitCode = 1;
                });
        });
    }

    logger.info(
        {
            queue: webhookDeliveryQueueName,
            concurrency: config.WEBHOOK_QUEUE_CONCURRENCY,
        },
        'BullMQ webhook worker started'
    );
}

try {
    await main();
} catch (error) {
    logger.fatal({ error }, 'Unable to start BullMQ webhook worker');
    process.exitCode = 1;
}
