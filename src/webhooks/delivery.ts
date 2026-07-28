import { createHmac } from 'node:crypto';
import { and, eq, inArray, lte } from 'drizzle-orm';
import { getConfig } from '../config';
import type { Database } from '../db/client';
import { webhookDeliveries, webhookEndpoints } from '../db/schema';
import { decrypt } from '../lib/crypto';
import type { logger as rootLogger } from '../lib/logger';
import type { WebhookEventType } from './events';

type Logger = typeof rootLogger;

/**
 * Persists one delivery per subscribed tenant endpoint.
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

    await db.insert(webhookDeliveries).values(
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
    );
}

async function deliverOne(
    db: Database,
    logger: Logger,
    delivery: typeof webhookDeliveries.$inferSelect,
    endpoint: typeof webhookEndpoints.$inferSelect
): Promise<void> {
    const payload = JSON.stringify(delivery.payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', decrypt(endpoint.encryptedSecret))
        .update(`${timestamp}.${payload}`)
        .digest('hex');

    let responseStatus: number | undefined;
    let errorMessage: string | undefined;
    try {
        const response = await fetch(endpoint.url, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'user-agent': 'peppol-hono-api-webhooks/1.0',
                'x-peppol-delivery': delivery.id,
                'x-peppol-event': delivery.event,
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
                    attempts: delivery.attempts + 1,
                    responseStatus,
                    deliveredAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(webhookDeliveries.id, delivery.id));
            return;
        }
        errorMessage = `HTTP ${response.status}`;
    } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
    }

    const attempts = delivery.attempts + 1;
    const exhausted = attempts >= getConfig().WEBHOOK_MAX_ATTEMPTS;
    const delaySeconds = Math.min(2 ** attempts * 30, 6 * 60 * 60);
    await db
        .update(webhookDeliveries)
        .set({
            status: exhausted ? 'FAILED' : 'PENDING',
            attempts,
            responseStatus,
            errorMessage,
            nextAttemptAt: new Date(Date.now() + delaySeconds * 1000),
            updatedAt: new Date(),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
    logger.warn(
        { deliveryId: delivery.id, attempts, errorMessage },
        'Client webhook delivery failed'
    );
}

/**
 * Delivers due webhooks. Concurrent workers safely re-deliver only idempotent
 * delivery IDs; consumers should de-duplicate on x-peppol-delivery.
 */
export async function deliverPendingWebhooks(
    db: Database,
    logger: Logger
): Promise<void> {
    const pending = await db
        .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
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
        .limit(25);

    await Promise.all(
        pending.map(({ delivery, endpoint }) =>
            deliverOne(db, logger, delivery, endpoint)
        )
    );
}

export function startWebhookWorker(db: Database, logger: Logger): () => void {
    const interval = setInterval(() => {
        deliverPendingWebhooks(db, logger).catch((error: unknown) => {
            logger.error({ error }, 'Webhook delivery worker failed');
        });
    }, getConfig().WEBHOOK_WORKER_INTERVAL_MS);
    interval.unref();
    return () => clearInterval(interval);
}
