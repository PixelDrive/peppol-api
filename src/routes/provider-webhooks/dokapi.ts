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
import { logger } from '../../lib/logger';
import { normalizePeppolParticipantIdentifier } from '../../lib/peppol-endpoint';
import { parseUblDocument } from '../../peppol/xml';
import { validateWithKosit } from '../../peppol/validation';
import { emitWebhookEvent } from '../../webhooks/delivery';
import { safeDokapiWebhookLogContext } from './dokapi-logging';
import { verifyDokapiWebhookSignature } from './dokapi-signature';

const dokapiEventSchema = z
    .object({
        ulid: z.string().min(1),
        event: z.string().min(1),
        body: z.record(z.string(), z.unknown()),
    })
    .passthrough();

class DokapiWebhookProcessingError extends Error {
    readonly name = 'DokapiWebhookProcessingError';

    constructor(
        readonly code: string,
        readonly processingStage: string
    ) {
        super(code);
    }
}

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

function documentNumberFromUbl(ublXml: string): string | undefined {
    try {
        return parseUblDocument(ublXml).documentId;
    } catch {
        return undefined;
    }
}

async function handleOutgoingFeedback(
    payload: z.infer<typeof dokapiEventSchema>
): Promise<void> {
    const externalReference = nestedString(payload.body, 'externalReference');
    if (!externalReference) {
        logger.warn(
            safeDokapiWebhookLogContext({
                eventId: payload.ulid,
                event: payload.event,
            }),
            'Dokapi event has no reference'
        );
        return;
    }

    const [document] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, externalReference))
        .limit(1);
    if (!document) {
        logger.warn(
            safeDokapiWebhookLogContext({
                eventId: payload.ulid,
                event: payload.event,
                documentId: externalReference,
            }),
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

    logger.info(
        safeDokapiWebhookLogContext({
            eventId: payload.ulid,
            event: payload.event,
            documentId: document.id,
            documentNumber: documentNumberFromUbl(document.ublXml),
            providerDocumentId: nestedString(payload.body, 'ulid'),
            senderParticipantId: identifierValue(payload.body, 'sender'),
            receiverParticipantId: identifierValue(payload.body, 'receiver'),
            providerStatus: dokapiStatus,
            status,
        }),
        'Dokapi outgoing document feedback processed'
    );
}

async function handleIncomingDocument(
    payload: z.infer<typeof dokapiEventSchema>
): Promise<void> {
    const rawReceiver = identifierValue(payload.body, 'receiver');
    const rawSender = identifierValue(payload.body, 'sender');
    const presignedUrl =
        nestedString(payload.body, 'presignedUrl') ??
        nestedString(payload.body, 'preSignedDownloadUrl');
    if (!rawReceiver || !rawSender || !presignedUrl) {
        throw new DokapiWebhookProcessingError(
            'MISSING_DOCUMENT_METADATA',
            'validate_metadata'
        );
    }

    const receiver = normalizePeppolParticipantIdentifier(rawReceiver);
    const sender = normalizePeppolParticipantIdentifier(rawSender);
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
                eq(enterpriseEndpoints.scheme, receiver.scheme),
                eq(enterpriseEndpoints.value, receiver.value)
            )
        )
        .limit(1);
    if (!target) {
        throw new DokapiWebhookProcessingError(
            'RECEIVER_NOT_OWNED',
            'resolve_receiver'
        );
    }

    const response = await fetch(presignedUrl, {
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        throw new DokapiWebhookProcessingError(
            'DOCUMENT_DOWNLOAD_FAILED',
            'download_document'
        );
    }
    const ublXml = await response.text();
    const metadata = parseUblDocument(ublXml);
    if (
        metadata.receiverEndpoint !== receiver.canonical ||
        metadata.senderEndpoint !== sender.canonical
    ) {
        throw new DokapiWebhookProcessingError(
            'DOCUMENT_PARTICIPANT_MISMATCH',
            'verify_participants'
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
                nestedString(payload.body, 'ulid') ?? payload.ulid,
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

    logger.info(
        safeDokapiWebhookLogContext({
            eventId: payload.ulid,
            event: payload.event,
            documentId: document!.id,
            documentNumber: metadata.documentId,
            providerDocumentId: nestedString(payload.body, 'ulid'),
            enterpriseId: target.enterprise.id,
            senderParticipantId: sender.canonical,
            receiverParticipantId: receiver.canonical,
            status: document!.status,
            validationStatus: validation.valid ? 'VALID' : 'INVALID',
        }),
        'Dokapi incoming document processed'
    );
}

export const dokapiWebhookRouter = new Hono();

dokapiWebhookRouter.get('/ping', (context) => context.text('pong'));

dokapiWebhookRouter.post('/events', async (context) => {
    const expectedSecret = getConfig().DOKAPI_WEBHOOK_SECRET;
    const receivedSignature = context.req.header('x-dokapi-signature');
    const rawBody = Buffer.from(await context.req.arrayBuffer());

    if (
        !expectedSecret ||
        !receivedSignature ||
        !verifyDokapiWebhookSignature(
            rawBody,
            receivedSignature,
            expectedSecret
        )
    ) {
        logger.warn({}, 'Dokapi webhook signature verification failed');
        return context.json({ error: 'Invalid Dokapi signature' }, 401);
    }

    let body: unknown;
    try {
        body = JSON.parse(rawBody.toString('utf8'));
    } catch {
        return context.json({ error: 'Invalid Dokapi event JSON' }, 400);
    }

    const parsed = dokapiEventSchema.safeParse(body);
    if (!parsed.success) {
        return context.json(
            { error: 'Invalid Dokapi event', issues: parsed.error.issues },
            400
        );
    }
    const payload = parsed.data;
    logger.info(
        safeDokapiWebhookLogContext({
            eventId: payload.ulid,
            event: payload.event,
            providerDocumentId: nestedString(payload.body, 'ulid'),
            senderParticipantId: identifierValue(payload.body, 'sender'),
            receiverParticipantId: identifierValue(payload.body, 'receiver'),
        }),
        'Dokapi webhook received'
    );

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
        logger.info(
            safeDokapiWebhookLogContext({
                eventId: payload.ulid,
                event: payload.event,
                providerDocumentId: nestedString(payload.body, 'ulid'),
                senderParticipantId: identifierValue(payload.body, 'sender'),
                receiverParticipantId: identifierValue(
                    payload.body,
                    'receiver'
                ),
                duplicate: true,
            }),
            'Duplicate Dokapi webhook ignored'
        );
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
                    safeDokapiWebhookLogContext({
                        event: payload.event,
                        eventId: payload.ulid,
                        providerDocumentId: nestedString(payload.body, 'ulid'),
                        senderParticipantId: identifierValue(
                            payload.body,
                            'sender'
                        ),
                        receiverParticipantId: identifierValue(
                            payload.body,
                            'receiver'
                        ),
                    }),
                    'Ignoring unsupported Dokapi event'
                );
        }
        return context.json({ received: true });
    } catch (error) {
        await db
            .delete(providerWebhookEvents)
            .where(eq(providerWebhookEvents.id, recorded.id));
        logger.error(
            safeDokapiWebhookLogContext({
                errorName: error instanceof Error ? error.name : 'UnknownError',
                errorCode:
                    error instanceof DokapiWebhookProcessingError
                        ? error.code
                        : 'UNEXPECTED_PROCESSING_ERROR',
                processingStage:
                    error instanceof DokapiWebhookProcessingError
                        ? error.processingStage
                        : undefined,
                eventId: payload.ulid,
                event: payload.event,
                providerDocumentId: nestedString(payload.body, 'ulid'),
                senderParticipantId: identifierValue(payload.body, 'sender'),
                receiverParticipantId: identifierValue(
                    payload.body,
                    'receiver'
                ),
            }),
            'Dokapi webhook processing failed'
        );
        return context.json({ error: 'Webhook processing failed' }, 500);
    }
});
