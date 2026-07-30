import { createHmac, timingSafeEqual } from 'node:crypto';

const sha256HexPattern = /^[\da-f]{64}$/i;

/**
 * Verifies Dokapi's hexadecimal HMAC-SHA256 signature against the exact raw
 * webhook body using a constant-time digest comparison.
 */
export function verifyDokapiWebhookSignature(
    rawBody: string | Buffer,
    receivedSignature: string,
    secret: string
): boolean {
    const normalizedSignature = receivedSignature.trim();
    if (!sha256HexPattern.test(normalizedSignature)) {
        return false;
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest();
    const received = Buffer.from(normalizedSignature, 'hex');
    return (
        received.length === expected.length &&
        timingSafeEqual(received, expected)
    );
}
