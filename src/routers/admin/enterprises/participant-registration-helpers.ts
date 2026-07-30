import { and, eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import type { Database } from '../../../db/client';
import { enterpriseEndpoints, enterprises } from '../../../db/schema';
import { PeppolProviderRequestError } from '../../../providers/errors';
import type { ParticipantIdentifier } from '../../../providers/types';

/** Resolves an identifier with both its enterprise and tenant predicate. */
export async function getEnterpriseParticipant(
    db: Database,
    enterpriseId: string,
    participantIdentifierId: string
) {
    const [target] = await db
        .select({
            enterprise: enterprises,
            participantIdentifier: enterpriseEndpoints,
        })
        .from(enterpriseEndpoints)
        .innerJoin(
            enterprises,
            eq(enterprises.id, enterpriseEndpoints.enterpriseId)
        )
        .where(
            and(
                eq(enterpriseEndpoints.id, participantIdentifierId),
                eq(enterpriseEndpoints.enterpriseId, enterpriseId)
            )
        )
        .limit(1);
    if (!target) {
        throw new ORPCError('NOT_FOUND');
    }
    return target;
}

export function toParticipantIdentifier(endpoint: {
    scheme: string;
    value: string;
}): ParticipantIdentifier {
    return {
        scheme: endpoint.scheme,
        value: endpoint.value,
        canonical: `${endpoint.scheme}:${endpoint.value}`,
    };
}

export function providerErrorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(
        0,
        4000
    );
}

export function throwProviderFailure(operation: string, error: unknown): never {
    if (error instanceof PeppolProviderRequestError) {
        const options = {
            message: `Peppol provider rejected the request to ${operation}.`,
            cause: error,
        };
        switch (error.status) {
            case 400:
                throw new ORPCError('BAD_REQUEST', options);
            case 403:
                throw new ORPCError('FORBIDDEN', options);
            case 404:
                throw new ORPCError('NOT_FOUND', options);
            case 409:
                throw new ORPCError('CONFLICT', options);
        }
    }
    throw new ORPCError('BAD_GATEWAY', {
        message: `Peppol provider failed to ${operation}.`,
        cause: error,
    });
}
