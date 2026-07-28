import { z } from 'zod';

const booleanFromString = z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true');

const configSchema = z.object({
    NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
    PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z.string().default('info'),
    DATABASE_URL: z
        .url()
        .default('postgresql://postgres:password@localhost:5432/peppol'),
    RUN_MIGRATIONS: booleanFromString,
    ADMIN_EMAIL: z.email().optional(),
    ADMIN_PASSWORD: z.string().min(12).optional(),
    ADMIN_SESSION_TTL_HOURS: z.coerce.number().positive().default(12),
    ENCRYPTION_SECRET: z
        .string()
        .regex(/^[\da-f]{64}$/i, 'must be 64 hexadecimal characters'),
    KOSIT_VALIDATOR_URL: z.url().default('http://peppol.apps.pixeldrive.be/'),
    VALIDATE_BEFORE_SEND: booleanFromString,
    DOKAPI_CLIENT_ID: z.string().min(1).optional(),
    DOKAPI_CLIENT_SECRET: z.string().min(1).optional(),
    DOKAPI_BASE_URL: z.url().default('https://peppol-api.dokapi-stg.io/v1'),
    DOKAPI_TOKEN_URL: z
        .url()
        .default('https://dev-portal.dokapi.io/api/oauth2/token'),
    DOKAPI_WEBHOOK_SECRET: z.string().min(16).optional(),
    PUBLIC_API_URL: z.url().default('http://localhost:3001'),
    WEBHOOK_WORKER_INTERVAL_MS: z.coerce.number().positive().default(30_000),
    WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | undefined;

/**
 * Parses environment variables once and returns validated runtime configuration.
 */
export function getConfig(): Config {
    cachedConfig ??= configSchema.parse(process.env);
    return cachedConfig;
}
