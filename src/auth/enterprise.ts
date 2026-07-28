import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { base } from './base';
import {
    enterpriseApiKeys,
    enterprises,
    type providerEnum,
} from '../db/schema';
import { parseApiKey } from '../lib/api-keys';
import { verifySecret } from '../lib/crypto';

type Enterprise = typeof enterprises.$inferSelect;
type Provider = (typeof providerEnum.enumValues)[number];

async function authorizeEnterprise(
    headers: Headers,
    context: Parameters<Parameters<typeof base.middleware>[0]>[0]['context']
): Promise<{ enterprise: Enterprise; provider: Provider }> {
    const rawKey = headers.get('x-api-key');
    const parsed = rawKey ? parseApiKey(rawKey) : null;
    if (!parsed) {
        throw new ORPCError('INVALID_API_KEY');
    }

    const [result] = await context.db
        .select({ apiKey: enterpriseApiKeys, enterprise: enterprises })
        .from(enterpriseApiKeys)
        .innerJoin(
            enterprises,
            eq(enterprises.id, enterpriseApiKeys.enterpriseId)
        )
        .where(
            and(
                eq(enterpriseApiKeys.prefix, parsed.prefix),
                eq(enterpriseApiKeys.active, true),
                eq(enterprises.active, true),
                or(
                    isNull(enterpriseApiKeys.expiresAt),
                    gt(enterpriseApiKeys.expiresAt, new Date())
                )
            )
        )
        .limit(1);

    if (
        !result ||
        !(await verifySecret(parsed.secret, result.apiKey.keyHash))
    ) {
        throw new ORPCError('INVALID_API_KEY');
    }

    await context.db
        .update(enterpriseApiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(enterpriseApiKeys.id, result.apiKey.id));

    return {
        enterprise: result.enterprise,
        provider: result.enterprise.provider,
    };
}

export const enterpriseProcedure = base.use(
    base.middleware(async ({ context, next }) =>
        next({
            context: await authorizeEnterprise(context.headers, context),
        })
    )
);
