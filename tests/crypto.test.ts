import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
    process.env.ENCRYPTION_SECRET = 'b'.repeat(64);
});

describe('credential encryption', () => {
    it('round-trips provider credentials with AES-256-GCM', async () => {
        const { decrypt, encrypt } = await import('../src/lib/crypto');
        const plaintext = JSON.stringify({
            clientId: 'tenant',
            clientSecret: 'very-secret',
        });
        const encrypted = encrypt(plaintext);

        expect(encrypted).not.toContain('very-secret');
        expect(decrypt(encrypted)).toBe(plaintext);
    });

    it('detects tampering', async () => {
        const { decrypt, encrypt } = await import('../src/lib/crypto');
        const encrypted = encrypt('secret');
        const [version, iv, tag, ciphertext] = encrypted.split('.');
        const replacement = ciphertext![0] === 'A' ? 'B' : 'A';
        const tampered = [
            version,
            iv,
            tag,
            `${replacement}${ciphertext!.slice(1)}`,
        ].join('.');
        expect(() => decrypt(tampered)).toThrow();
    });
});
