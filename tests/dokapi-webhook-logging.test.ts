import { describe, expect, it } from 'vitest';
import { safeDokapiWebhookLogContext } from '../src/routes/provider-webhooks/dokapi-logging';

describe('Dokapi webhook logging', () => {
    it('keeps operational metadata and removes private payload data', () => {
        const context = safeDokapiWebhookLogContext({
            eventId: 'event-id',
            event: 'incoming-peppol-documents.received',
            providerDocumentId: 'provider-document-id',
            documentId: 'internal-document-id',
            documentNumber: 'TEST-2026-001',
            enterpriseId: 'enterprise-id',
            senderParticipantId: '0208:0732788874',
            receiverParticipantId: '0208:1022713956',
            status: 'RECEIVED',
            validationStatus: 'VALID',
            errorCode: 'RECEIVER_NOT_OWNED',
            processingStage: 'resolve_receiver',
            ublXml: '<Invoice>private contents</Invoice>',
            presignedUrl: 'https://private.example/download?secret=value',
            sender: { value: '0208:0000000000' },
            receiver: { value: '0208:1111111111' },
            webhookSecret: 'private-secret',
            errorMessage: 'private provider response',
        });

        expect(context).toEqual({
            eventId: 'event-id',
            event: 'incoming-peppol-documents.received',
            providerDocumentId: 'provider-document-id',
            documentId: 'internal-document-id',
            documentNumber: 'TEST-2026-001',
            enterpriseId: 'enterprise-id',
            senderParticipantId: '0208:0732788874',
            receiverParticipantId: '0208:1022713956',
            status: 'RECEIVED',
            validationStatus: 'VALID',
            errorCode: 'RECEIVER_NOT_OWNED',
            processingStage: 'resolve_receiver',
        });
    });

    it('omits unavailable values', () => {
        expect(
            safeDokapiWebhookLogContext({
                eventId: 'event-id',
                documentNumber: undefined,
                providerStatus: undefined,
                duplicate: false,
            })
        ).toEqual({
            eventId: 'event-id',
            duplicate: false,
        });
    });
});
