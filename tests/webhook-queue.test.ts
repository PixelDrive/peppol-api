import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
});

describe('BullMQ webhook delivery settings', () => {
    it('uses a stable delivery ID and durable retry policy', async () => {
        const { webhookDeliveryJobOptions } =
            await import('../src/queues/webhook-deliveries');
        const options = webhookDeliveryJobOptions(
            '018f89d7-7460-7b86-b71f-53bb1f0b0771'
        );

        expect(options.jobId).toBe('018f89d7-7460-7b86-b71f-53bb1f0b0771');
        expect(options.attempts).toBe(8);
        expect(options.backoff).toEqual({
            type: 'exponential',
            delay: 30_000,
        });
    });

    it('caps exponential retry delays at six hours', async () => {
        const { calculateWebhookRetryDelay } =
            await import('../src/webhooks/delivery');

        expect(calculateWebhookRetryDelay(1)).toBe(30_000);
        expect(calculateWebhookRetryDelay(2)).toBe(60_000);
        expect(calculateWebhookRetryDelay(100)).toBe(6 * 60 * 60 * 1000);
    });
});
