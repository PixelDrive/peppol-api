import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyDokapiWebhookSignature } from '../src/routes/provider-webhooks/dokapi-signature';

const secret = 'test-dokapi-webhook-secret';
const rawBody =
    '{"event":"outgoing-peppol-documents.sent","ulid":"event-id","body":{"ulid":"document-id"}}';

function sign(body: string | Buffer): string {
    return createHmac('sha256', secret).update(body).digest('hex');
}

describe('Dokapi webhook signatures', () => {
    it('accepts the HMAC-SHA256 signature of the exact raw body', () => {
        expect(
            verifyDokapiWebhookSignature(rawBody, sign(rawBody), secret)
        ).toBe(true);
        expect(
            verifyDokapiWebhookSignature(
                Buffer.from(rawBody),
                sign(rawBody).toUpperCase(),
                secret
            )
        ).toBe(true);
    });

    it('rejects payload changes, including JSON whitespace changes', () => {
        const signature = sign(rawBody);

        expect(
            verifyDokapiWebhookSignature(
                rawBody.replace(',"ulid"', ', "ulid"'),
                signature,
                secret
            )
        ).toBe(false);
        expect(
            verifyDokapiWebhookSignature(
                rawBody.replace('event-id', 'other-event-id'),
                signature,
                secret
            )
        ).toBe(false);
    });

    it('rejects missing-length and non-hexadecimal signatures', () => {
        expect(verifyDokapiWebhookSignature(rawBody, 'abcd', secret)).toBe(
            false
        );
        expect(
            verifyDokapiWebhookSignature(rawBody, 'z'.repeat(64), secret)
        ).toBe(false);
    });
});
