import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    scrypt as scryptCallback,
    timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { getConfig } from '../config';

const scrypt = promisify(scryptCallback);
const algorithm = 'aes-256-gcm';

/**
 * Encrypts a UTF-8 value with authenticated AES-256-GCM encryption.
 */
export function encrypt(value: string): string {
    const key = Buffer.from(getConfig().ENCRYPTION_SECRET, 'hex');
    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, key, iv);
    const ciphertext = Buffer.concat([
        cipher.update(value, 'utf8'),
        cipher.final(),
    ]);
    return [
        'v1',
        iv.toString('base64url'),
        cipher.getAuthTag().toString('base64url'),
        ciphertext.toString('base64url'),
    ].join('.');
}

/**
 * Decrypts a value produced by {@link encrypt} and authenticates its tag.
 */
export function decrypt(value: string): string {
    const [version, ivValue, tagValue, ciphertextValue] = value.split('.');
    if (version !== 'v1' || !ivValue || !tagValue || !ciphertextValue) {
        throw new Error('Unsupported encrypted value');
    }

    const decipher = createDecipheriv(
        algorithm,
        Buffer.from(getConfig().ENCRYPTION_SECRET, 'hex'),
        Buffer.from(ivValue, 'base64url')
    );
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextValue, 'base64url')),
        decipher.final(),
    ]).toString('utf8');
}

/**
 * Hashes a password or API key with scrypt and a unique random salt.
 */
export async function hashSecret(value: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = (await scrypt(value, salt, 64)) as Buffer;
    return `scrypt.${salt.toString('base64url')}.${derived.toString('base64url')}`;
}

/**
 * Verifies a password or API key without leaking comparison timing.
 */
export async function verifySecret(
    value: string,
    encodedHash: string
): Promise<boolean> {
    const [kind, saltValue, expectedValue] = encodedHash.split('.');
    if (kind !== 'scrypt' || !saltValue || !expectedValue) {
        return false;
    }
    const expected = Buffer.from(expectedValue, 'base64url');
    const actual = (await scrypt(
        value,
        Buffer.from(saltValue, 'base64url'),
        expected.length
    )) as Buffer;
    return (
        actual.length === expected.length && timingSafeEqual(actual, expected)
    );
}

/**
 * Returns a stable SHA-256 digest suitable for opaque session-token lookup.
 */
export function digestSecret(value: string): string {
    return createHash('sha256').update(value).digest('base64url');
}

export function secretsEqual(left: string, right: string): boolean {
    const leftDigest = createHash('sha256').update(left).digest();
    const rightDigest = createHash('sha256').update(right).digest();
    return timingSafeEqual(leftDigest, rightDigest);
}
