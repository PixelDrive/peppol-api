import { and, eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { getConfig } from '../config';
import type { Database } from '../db/client';
import { providerCredentials } from '../db/schema';
import { decrypt } from '../lib/crypto';
import { DokapiProvider } from './dokapi';
import type { DokapiCredentials, PeppolProvider } from './types';

const storedDokapiCredentialsSchema = z.object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
    baseUrl: z.url(),
    tokenUrl: z.url().optional(),
});

type EnterpriseProviderConfiguration = {
    id: string;
    provider: 'DOKAPI';
    useGlobalProviderCredentials: boolean;
};

async function resolveDokapiCredentials(
    db: Database,
    enterprise: EnterpriseProviderConfiguration
): Promise<DokapiCredentials> {
    const config = getConfig();
    if (enterprise.useGlobalProviderCredentials) {
        if (!config.DOKAPI_CLIENT_ID || !config.DOKAPI_CLIENT_SECRET) {
            throw new ORPCError('PRECONDITION_FAILED', {
                message: 'Global Dokapi credentials are not configured',
            });
        }
        return {
            clientId: config.DOKAPI_CLIENT_ID,
            clientSecret: config.DOKAPI_CLIENT_SECRET,
            baseUrl: config.DOKAPI_BASE_URL,
            tokenUrl: config.DOKAPI_TOKEN_URL,
        };
    }

    const [stored] = await db
        .select()
        .from(providerCredentials)
        .where(
            and(
                eq(providerCredentials.enterpriseId, enterprise.id),
                eq(providerCredentials.provider, 'DOKAPI')
            )
        )
        .limit(1);
    if (!stored) {
        throw new ORPCError('PRECONDITION_FAILED', {
            message: 'Enterprise Dokapi credentials are not configured',
        });
    }

    const parsed = storedDokapiCredentialsSchema.parse(
        JSON.parse(decrypt(stored.encryptedCredentials))
    );
    return {
        ...parsed,
        tokenUrl: parsed.tokenUrl ?? config.DOKAPI_TOKEN_URL,
    };
}

/**
 * Resolves tenant-specific or global credentials and returns a provider adapter.
 */
export async function getProvider(
    db: Database,
    enterprise: EnterpriseProviderConfiguration
): Promise<PeppolProvider> {
    return new DokapiProvider(await resolveDokapiCredentials(db, enterprise));
}
