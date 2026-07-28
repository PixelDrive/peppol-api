import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getConfig } from '../../config';
import { db } from '../../db/client';
import {
    documents,
    enterpriseEndpoints,
    enterprises,
    providerWebhookEvents,
} from '../../db/schema';
import { secretsEqual } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { parseUblDocument } from '../../peppol/xml';
import { validateWithKosit } from '../../peppol/validation';
import { emitWebhookEvent } from '../../webhooks/delivery';

const dokapiEventSchema = z
    .object({
        ulid: z.string().min(1),
        event: z.string().min(1),
        body: z.record(z.string(), z.unknown()),
    })
    .passthrough();

function nestedString(
    body: Record<string, unknown>,
    key: string
): string | undefined {
    const value = body[key];
    return typeof value === 'string' ? value : undefined;
}

function identifierValue(
    body: Record<string, unknown>,
    key: string
): string | undefined {
    const candidate = body[key];
    if (!candidate || typeof candidate !== 'object') {
        return undefined;
    }
    const value = (candidate as Record<string, unknown>).value;
    return typeof value === 'string' ? value.toLowerCase() : undefined;
}

async function handleOutgoingFeedback(
    payload: z.infer<typeof dokapiEventSchema>
): Promise<void> {
    const externalReference = nestedString(payload.body, 'externalReference');
    if (!externalReference) {
        logger.warn({ eventId: payload.ulid }, 'Dokapi event has no reference');
        return;
    }

    const [document] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, externalReference))
        .limit(1);
    if (!document) {
        logger.warn(
            { externalReference },
            'Dokapi event references an unknown document'
        );
        return;
    }

    const dokapiStatus = nestedString(payload.body, 'status');
    const success = dokapiStatus === 'SENT' || dokapiStatus === 'DELIVERED';
    const status =
        dokapiStatus === 'DELIVERED'
            ? 'DELIVERED'
            : success
              ? 'SENT'
              : 'FAILED';
    const errorMessage = success
        ? null
        : (nestedString(payload.body, 'errorMessage') ??
          nestedString(payload.body, 'statusMessage') ??
          'Dokapi reported a delivery failure');

    await db
        .update(documents)
        .set({
            status,
            errorMessage,
            updatedAt: new Date(),
        })
        .where(eq(documents.id, document.id));

    await emitWebhookEvent(
        db,
        document.enterpriseId,
        status === 'DELIVERED'
            ? 'document.delivered'
            : success
              ? 'document.sent'
              : 'document.failed',
        document.id,
        {
            status,
            provider: 'DOKAPI',
            providerStatus: dokapiStatus,
            error: errorMessage,
        }
    );
}

async function handleIncomingDocument(
    payload: z.infer<typeof dokapiEventSchema>
): Promise<void> {
    const receiver = identifierValue(payload.body, 'receiver');
    const sender = identifierValue(payload.body, 'sender');
    const presignedUrl =
        nestedString(payload.body, 'presignedUrl') ??
        nestedString(payload.body, 'preSignedDownloadUrl');
    if (!receiver || !sender || !presignedUrl) {
        throw new Error(
            'Incoming Dokapi event is missing sender, receiver or presignedUrl'
        );
    }

    const separator = receiver.indexOf(':');
    const scheme = receiver.slice(0, separator);
    const value = receiver.slice(separator + 1);
    const [target] = await db
        .select({ endpoint: enterpriseEndpoints, enterprise: enterprises })
        .from(enterpriseEndpoints)
        .innerJoin(
            enterprises,
            and(
                eq(enterprises.id, enterpriseEndpoints.enterpriseId),
                eq(enterprises.active, true)
            )
        )
        .where(
            and(
                eq(enterpriseEndpoints.scheme, scheme),
                eq(enterpriseEndpoints.value, value)
            )
        )
        .limit(1);
    if (!target) {
        throw new Error(`No enterprise owns receiver EndpointID ${receiver}`);
    }

    const response = await fetch(presignedUrl, {
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new Error(
            `Unable to download incoming UBL: HTTP ${response.status}`
        );
    }
    const ublXml = await response.text();
    const metadata = parseUblDocument(ublXml);
    if (metadata.receiverEndpoint !== receiver) {
        throw new Error(
            'Incoming XML receiver EndpointID differs from the authenticated Dokapi event'
        );
    }

    const validation = await validateWithKosit(ublXml);
    const [document] = await db
        .insert(documents)
        .values({
            enterpriseId: target.enterprise.id,
            type: metadata.type,
            direction: 'INCOMING',
            status: validation.valid ? 'RECEIVED' : 'INVALID',
            senderEndpoint: metadata.senderEndpoint,
            receiverEndpoint: metadata.receiverEndpoint,
            providerDocumentId:
                nestedString(payload.body, 'id') ?? payload.ulid,
            externalReference: nestedString(payload.body, 'externalReference'),
            ublXml,
            errorMessage: validation.valid
                ? null
                : validation.errors.map((error) => error.text).join('\n'),
        })
        .returning();

    await emitWebhookEvent(
        db,
        target.enterprise.id,
        validation.valid ? 'document.received' : 'document.invalid',
        document!.id,
        {
            status: document!.status,
            senderEndpoint: metadata.senderEndpoint,
            receiverEndpoint: metadata.receiverEndpoint,
            validationErrors: validation.errors,
        }
    );
}

export const dokapiWebhookRouter = new Hono();

dokapiWebhookRouter.get('/ping', (context) => context.text('pong'));

dokapiWebhookRouter.post('/events', async (context) => {
    const expectedSecret = getConfig().DOKAPI_WEBHOOK_SECRET;
    const authorization = context.req.header('authorization');
    const providedSecret =
        context.req.header('x-webhook-secret') ??
        (authorization?.startsWith('Bearer ')
            ? authorization.slice('Bearer '.length)
            : undefined);
    if (
        !expectedSecret ||
        !providedSecret ||
        !secretsEqual(providedSecret, expectedSecret)
    ) {
        return context.json({ error: 'Invalid webhook secret' }, 401);
    }

    const parsed = dokapiEventSchema.safeParse(await context.req.json());
    if (!parsed.success) {
        return context.json(
            { error: 'Invalid Dokapi event', issues: parsed.error.issues },
            400
        );
    }
    const payload = parsed.data;

    const [recorded] = await db
        .insert(providerWebhookEvents)
        .values({
            provider: 'DOKAPI',
            providerEventId: payload.ulid,
            payload,
        })
        .onConflictDoNothing()
        .returning({ id: providerWebhookEvents.id });
    if (!recorded) {
        return context.json({ received: true, duplicate: true });
    }

    try {
        switch (payload.event) {
            case 'outgoing-peppol-documents.sent':
                await handleOutgoingFeedback(payload);
                break;
            case 'incoming-peppol-documents.received':
                await handleIncomingDocument(payload);
                break;
            default:
                logger.info(
                    { event: payload.event, eventId: payload.ulid },
                    'Ignoring unsupported Dokapi event'
                );
        }
        return context.json({ received: true });
    } catch (error) {
        await db
            .delete(providerWebhookEvents)
            .where(eq(providerWebhookEvents.id, recorded.id));
        logger.error(
            { error, eventId: payload.ulid, event: payload.event },
            'Dokapi webhook processing failed'
        );
        return context.json({ error: 'Webhook processing failed' }, 500);
    }
});
