import { beforeAll, describe, expect, it } from 'vitest';

beforeAll(() => {
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
});

describe('enterprise API keys', () => {
    it('stores only a verifiable secret hash', async () => {
        const { generateApiKey, parseApiKey } =
            await import('../src/lib/api-keys');
        const { verifySecret } = await import('../src/lib/crypto');
        const generated = await generateApiKey('test');
        const parsed = parseApiKey(generated.apiKey);

        expect(parsed?.prefix).toBe(generated.prefix);
        expect(generated.hash).not.toContain(parsed!.secret);
        await expect(
            verifySecret(parsed!.secret, generated.hash)
        ).resolves.toBe(true);
        await expect(verifySecret('wrong', generated.hash)).resolves.toBe(
            false
        );
    });

    it('rejects arbitrary bearer strings', async () => {
        const { parseApiKey } = await import('../src/lib/api-keys');
        expect(parseApiKey('not-an-api-key')).toBeNull();
    });
});
