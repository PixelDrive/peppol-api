import { and, eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import type { Database } from '../db/client';
import { enterpriseEndpoints } from '../db/schema';
import { normalizePeppolParticipantIdentifier } from '../lib/peppol-endpoint';

/**
 * Prevents tenant impersonation by checking the supplier EndpointID extracted
 * from the UBL XML against the authenticated enterprise.
 */
export async function assertSenderBelongsToEnterprise(
    db: Database,
    enterpriseId: string,
    senderEndpoint: string
): Promise<void> {
    let participantIdentifier;
    try {
        participantIdentifier =
            normalizePeppolParticipantIdentifier(senderEndpoint);
    } catch (error) {
        throw new ORPCError('BAD_REQUEST', {
            message: 'Supplier participant identifier is invalid.',
            cause: error,
        });
    }
    const { scheme, value, canonical } = participantIdentifier;

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
            message: `Supplier participant identifier "${canonical}" is not registered for the authenticated enterprise.`,
        });
    }
}
