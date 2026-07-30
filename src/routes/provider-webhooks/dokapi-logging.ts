const allowedDokapiWebhookLogKeys = [
    'eventId',
    'event',
    'providerDocumentId',
    'documentId',
    'documentNumber',
    'enterpriseId',
    'senderParticipantId',
    'receiverParticipantId',
    'providerStatus',
    'status',
    'validationStatus',
    'duplicate',
    'errorName',
    'errorCode',
    'processingStage',
] as const;

/**
 * Restricts Dokapi webhook logs to operational identifiers and statuses.
 * Payloads, XML, party data, presigned URLs, secrets and error messages are
 * deliberately excluded even if a caller includes them in the input.
 */
export function safeDokapiWebhookLogContext(
    input: Record<string, unknown>
): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    for (const key of allowedDokapiWebhookLogKeys) {
        if (input[key] !== undefined) {
            context[key] = input[key];
        }
    }
    return context;
}
