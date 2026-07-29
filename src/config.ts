import { z } from 'zod';

const booleanFromString = z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true');

function emptyStringToUndefined(value: unknown): unknown {
    return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

const optionalProviderValue = z.preprocess(
    emptyStringToUndefined,
    z.string().min(1).optional()
);

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
    PEPPOL_SML_DOMAIN: z
        .string()
        .regex(
            /^(?:[\da-z](?:[\da-z-]{0,61}[\da-z])?\.)+[\da-z](?:[\da-z-]{0,61}[\da-z])?$/i,
            'must be a valid DNS domain without a trailing dot'
        )
        .default('edelivery.tech.ec.europa.eu'),
    PEPPOL_LOOKUP_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .positive()
        .default(10_000),
    DOKAPI_CLIENT_ID: optionalProviderValue,
    DOKAPI_CLIENT_SECRET: optionalProviderValue,
    DOKAPI_BASE_URL: z.preprocess(
        emptyStringToUndefined,
        z.url().default('https://peppol-api.dokapi-stg.io/v1')
    ),
    DOKAPI_TOKEN_URL: z.preprocess(
        emptyStringToUndefined,
        z.url().default('https://dev-portal.dokapi.io/api/oauth2/token')
    ),
    DOKAPI_WEBHOOK_SECRET: z.preprocess(
        emptyStringToUndefined,
        z.string().min(16).optional()
    ),
    PUBLIC_API_URL: z.url().default('http://localhost:3001'),
    REDIS_URL: z.url().default('redis://:devpassword@localhost:6379'),
    WEBHOOK_QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(10),
    WEBHOOK_RECONCILE_INTERVAL_MS: z.coerce.number().positive().default(30_000),
    WEBHOOK_RETRY_BASE_DELAY_MS: z.coerce.number().positive().default(30_000),
    WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
});

export type Config = z.infer<typeof configSchema>;

let cachedConfig: Config | undefined;

/**
 * Parses an explicit environment object without mutating process.env.
 */
export function parseConfig(
    environment: Record<string, string | undefined>
): Config {
    return configSchema.parse(environment);
}

/**
 * Parses environment variables once and returns validated runtime configuration.
 */
export function getConfig(): Config {
    cachedConfig ??= parseConfig(process.env);
    return cachedConfig;
}
