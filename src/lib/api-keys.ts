import { randomBytes } from 'node:crypto';
import { hashSecret } from './crypto';

const apiKeyPattern =
    /^(pp_(?:live|test)_[A-Za-z0-9_-]{12})\.([A-Za-z0-9_-]{32,})$/;

export type GeneratedApiKey = {
    apiKey: string;
    prefix: string;
    hash: string;
};

/**
 * Generates an enterprise API key. Only the prefix and scrypt hash are stored.
 */
export async function generateApiKey(
    environment: 'live' | 'test' = 'live'
): Promise<GeneratedApiKey> {
    const identifier = randomBytes(9).toString('base64url');
    const secret = randomBytes(32).toString('base64url');
    const prefix = `pp_${environment}_${identifier}`;
    return {
        apiKey: `${prefix}.${secret}`,
        prefix,
        hash: await hashSecret(secret),
    };
}

/**
 * Splits a client API key into its public lookup prefix and private secret.
 */
export function parseApiKey(
    value: string
): { prefix: string; secret: string } | null {
    const match = apiKeyPattern.exec(value);
    if (!match?.[1] || !match[2]) {
        return null;
    }
    return { prefix: match[1], secret: match[2] };
}
