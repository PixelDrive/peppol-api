import { and, eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import type { Database } from '../db/client';
import { enterpriseEndpoints } from '../db/schema';

/**
 * Prevents tenant impersonation by checking the supplier EndpointID extracted
 * from the UBL XML against the authenticated enterprise.
 */
export async function assertSenderBelongsToEnterprise(
    db: Database,
    enterpriseId: string,
    senderEndpoint: string
): Promise<void> {
    const separator = senderEndpoint.indexOf(':');
    const scheme = senderEndpoint.slice(0, separator);
    const value = senderEndpoint.slice(separator + 1);

    const [allowed] = await db
        .select({ id: enterpriseEndpoints.id })
        .from(enterpriseEndpoints)
        .where(
            and(
                eq(enterpriseEndpoints.enterpriseId, enterpriseId),
                eq(enterpriseEndpoints.scheme, scheme),
                eq(enterpriseEndpoints.value, value)
            )
        )
        .limit(1);

    if (!allowed) {
        throw new ORPCError('FORBIDDEN', {
            message:
                `Supplier EndpointID "${senderEndpoint}" does not belong to the authenticated enterprise. ` +
                'Belgian senders must use their 0208 BCE/KBO enterprise number.',
        });
    }
}
