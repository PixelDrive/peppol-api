import { and, eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseEndpoints } from '../../../db/schema';

export const removeParticipantIdentifier = adminProcedure
    .route({
        method: 'DELETE',
        path: '/{enterpriseId}/participant-identifiers/{participantIdentifierId}',
        summary: 'Remove an enterprise participant identifier',
        description:
            'Stops inbound routing and outbound sender authorization for this identifier. An enterprise must retain at least one identifier.',
    })
    .input(
        z.object({
            enterpriseId: z.uuid(),
            participantIdentifierId: z.uuid(),
        })
    )
    .handler(async ({ context: { db }, input }) => {
        await db.transaction(
            async (transaction) => {
                const [target] = await transaction
                    .select({
                        id: enterpriseEndpoints.id,
                        networkRegistrationStatus:
                            enterpriseEndpoints.networkRegistrationStatus,
                    })
                    .from(enterpriseEndpoints)
                    .where(
                        and(
                            eq(
                                enterpriseEndpoints.id,
                                input.participantIdentifierId
                            ),
                            eq(
                                enterpriseEndpoints.enterpriseId,
                                input.enterpriseId
                            )
                        )
                    )
                    .limit(1);
                if (!target) {
                    throw new ORPCError('NOT_FOUND');
                }
                if (target.networkRegistrationStatus !== 'NOT_REGISTERED') {
                    throw new ORPCError('PRECONDITION_FAILED', {
                        message:
                            'Confirm or remove the participant network registration before deleting its local identifier.',
                    });
                }
                const identifiers = await transaction
                    .select({ id: enterpriseEndpoints.id })
                    .from(enterpriseEndpoints)
                    .where(
                        eq(enterpriseEndpoints.enterpriseId, input.enterpriseId)
                    )
                    .limit(2);
                if (identifiers.length === 1) {
                    throw new ORPCError('CONFLICT', {
                        message:
                            'An enterprise must retain at least one participant identifier.',
                    });
                }

                await transaction
                    .delete(enterpriseEndpoints)
                    .where(
                        and(
                            eq(
                                enterpriseEndpoints.id,
                                input.participantIdentifierId
                            ),
                            eq(
                                enterpriseEndpoints.enterpriseId,
                                input.enterpriseId
                            )
                        )
                    );
            },
            { isolationLevel: 'serializable' }
        );
        return { success: true };
    });
