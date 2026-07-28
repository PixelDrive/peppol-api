export const webhookEventTypes = [
    'document.pending',
    'document.sent',
    'document.delivered',
    'document.failed',
    'document.received',
    'document.invalid',
] as const;

export type WebhookEventType = (typeof webhookEventTypes)[number];
