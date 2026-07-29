import { createHmac } from 'node:crypto';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { getConfig } from '../config';
import type { Database } from '../db/client';
import { webhookDeliveries, webhookEndpoints } from '../db/schema';
import { decrypt } from '../lib/crypto';
import { logger } from '../lib/logger';
import { enqueueWebhookDelivery } from '../queues/webhook-deliveries';
import type { WebhookEventType } from './events';

/**
 * Persists one outbox delivery per subscribed tenant endpoint, then publishes
 * idempotent BullMQ jobs. Failed publications are recovered by reconciliation.
 */
export async function emitWebhookEvent(
    db: Database,
    enterpriseId: string,
    event: WebhookEventType,
    documentId: string | null,
    data: Record<string, unknown>
): Promise<void> {
    const endpoints = await db
        .select()
        .from(webhookEndpoints)
        .where(
            and(
                eq(webhookEndpoints.enterpriseId, enterpriseId),
                eq(webhookEndpoints.active, true)
            )
        );
    const subscribed = endpoints.filter((endpoint) =>
        endpoint.events.includes(event)
    );
    if (subscribed.length === 0) {
        return;
    }

    const deliveries = await db
        .insert(webhookDeliveries)
        .values(
            subscribed.map((endpoint) => ({
                webhookEndpointId: endpoint.id,
                documentId,
                event,
                payload: {
                    id: documentId,
                    type: event,
                    createdAt: new Date().toISOString(),
                    data,
                },
            }))
        )
        .returning({ id: webhookDeliveries.id });

    const publications = await Promise.allSettled(
        deliveries.map(({ id }) => enqueueWebhookDelivery(id))
    );
    for (const [index, publication] of publications.entries()) {
        if (publication.status === 'rejected') {
            logger.warn(
                {
                    deliveryId: deliveries[index]?.id,
                    error: publication.reason,
                },
                'Webhook saved to outbox but BullMQ publication failed'
            );
        }
    }
}

export function calculateWebhookRetryDelay(attemptNumber: number): number {
    return Math.min(
        getConfig().WEBHOOK_RETRY_BASE_DELAY_MS *
            2 ** Math.max(attemptNumber - 1, 0),
        6 * 60 * 60 * 1000
    );
}

/**
 * Processes one durable BullMQ delivery job and mirrors its state to the SQL
 * outbox. Throwing delegates retry timing and crash recovery to BullMQ.
 */
export async function deliverWebhookJob(
    db: Database,
    deliveryId: string,
    attemptNumber: number,
    maxAttempts: number
): Promise<void> {
    const [record] = await db
        .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
        .from(webhookDeliveries)
        .innerJoin(
            webhookEndpoints,
            eq(webhookEndpoints.id, webhookDeliveries.webhookEndpointId)
        )
        .where(eq(webhookDeliveries.id, deliveryId))
        .limit(1);

    if (!record || record.delivery.status !== 'PENDING') {
        return;
    }
    if (!record.endpoint.active) {
        await db
            .update(webhookDeliveries)
            .set({
                status: 'FAILED',
                errorMessage: 'Webhook endpoint is disabled',
                updatedAt: new Date(),
            })
            .where(eq(webhookDeliveries.id, deliveryId));
        return;
    }

    const payload = JSON.stringify(record.delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac(
        'sha256',
        decrypt(record.endpoint.encryptedSecret)
    )
        .update(`${timestamp}.${payload}`)
        .digest('hex');

    let responseStatus: number | undefined;
    let errorMessage: string | undefined;
    try {
        const response = await fetch(record.endpoint.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'user-agent': 'peppol-hono-api-webhooks/1.0',
                'x-peppol-delivery': record.delivery.id,
                'x-peppol-event': record.delivery.event,
                'x-peppol-timestamp': timestamp,
                'x-peppol-signature': `v1=${signature}`,
            },
            body: payload,
            signal: AbortSignal.timeout(10_000),
        });
        responseStatus = response.status;
        if (response.ok) {
            await db
                .update(webhookDeliveries)
                .set({
                    status: 'DELIVERED',
                    attempts: attemptNumber,
                    responseStatus,
                    errorMessage: null,
                    deliveredAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(webhookDeliveries.id, deliveryId));
            return;
        }
        errorMessage = `HTTP ${response.status}`;
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
    }

    const exhausted = attemptNumber >= maxAttempts;
    await db
        .update(webhookDeliveries)
        .set({
            status: exhausted ? 'FAILED' : 'PENDING',
            attempts: attemptNumber,
            responseStatus,
            errorMessage,
            nextAttemptAt: new Date(
                Date.now() + calculateWebhookRetryDelay(attemptNumber)
            ),
            updatedAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, deliveryId));

    logger.warn(
        { deliveryId, attemptNumber, maxAttempts, errorMessage },
        'Client webhook delivery failed'
    );
    throw new Error(errorMessage);
}

/**
 * Republishes due SQL outbox rows. Stable BullMQ job IDs make this safe when a
 * job is already waiting, active or delayed.
 */
export async function reconcilePendingWebhookDeliveries(
    db: Database
): Promise<void> {
    const pending = await db
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .innerJoin(
            webhookEndpoints,
            eq(webhookEndpoints.id, webhookDeliveries.webhookEndpointId)
        )
        .where(
            and(
                inArray(webhookDeliveries.status, ['PENDING']),
                lte(webhookDeliveries.nextAttemptAt, new Date()),
                eq(webhookEndpoints.active, true)
            )
        )
        .limit(100);

    const publications = await Promise.allSettled(
        pending.map(({ id }) => enqueueWebhookDelivery(id))
    );
    const rejected = publications.filter(
        (publication) => publication.status === 'rejected'
    );
    if (rejected.length > 0) {
        logger.warn(
            { failed: rejected.length, total: publications.length },
            'Some webhook outbox rows could not be reconciled with BullMQ'
        );
    }
}
