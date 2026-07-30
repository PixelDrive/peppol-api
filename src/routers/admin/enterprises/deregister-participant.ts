import { and, eq, notInArray } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseEndpoints } from '../../../db/schema';
import { getProvider } from '../../../providers/factory';
import { deregisterParticipantOutputSchema } from '../../output-schemas';
import {
    getEnterpriseParticipant,
    providerErrorMessage,
    throwProviderFailure,
    toParticipantIdentifier,
} from './participant-registration-helpers';
import { participantRegistrationPathSchema } from './participant-registration-schemas';

export const deregisterParticipant = adminProcedure
    .route({
        method: 'DELETE',
        path: '/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-registration',
        summary: 'Deregister a participant from the Peppol network',
        description:
            'Deregisters the participant through the configured provider without deleting its local ownership record.',
    })
    .input(participantRegistrationPathSchema)
    .output(deregisterParticipantOutputSchema)
    .handler(async ({ context: { db }, input }) => {
        const target = await getEnterpriseParticipant(
            db,
            input.enterpriseId,
            input.participantIdentifierId
        );
        if (
            target.participantIdentifier.networkRegistrationStatus ===
                'REGISTERING' ||
            target.participantIdentifier.networkRegistrationStatus ===
                'DEREGISTERING'
        ) {
            throw new ORPCError('CONFLICT', {
                message:
                    'A network registration operation is already in progress for this participant.',
            });
        }

        const provider = await getProvider(db, target.enterprise);
        const [claimed] = await db
            .update(enterpriseEndpoints)
            .set({
                networkRegistrationStatus: 'DEREGISTERING',
                registrationAttemptedAt: new Date(),
                registrationError: null,
            })
            .where(
                and(
                    eq(enterpriseEndpoints.id, input.participantIdentifierId),
                    eq(enterpriseEndpoints.enterpriseId, input.enterpriseId),
                    notInArray(enterpriseEndpoints.networkRegistrationStatus, [
                        'REGISTERING',
                        'DEREGISTERING',
                    ])
                )
            )
            .returning({ id: enterpriseEndpoints.id });
        if (!claimed) {
            throw new ORPCError('CONFLICT', {
                message:
                    'A network registration operation started concurrently for this participant.',
            });
        }

        const participantIdentifier = toParticipantIdentifier(
            target.participantIdentifier
        );
        try {
            await provider.deregisterParticipant(participantIdentifier);
            await db
                .update(enterpriseEndpoints)
                .set({
                    networkRegistrationStatus: 'NOT_REGISTERED',
                    registrationProvider: null,
                    providerRegistrationId: null,
                    registrationDetails: null,
                    registeredAt: null,
                    registrationError: null,
                })
                .where(
                    and(
                        eq(
                            enterpriseEndpoints.id,
                            input.participantIdentifierId
                        ),
                        eq(enterpriseEndpoints.enterpriseId, input.enterpriseId)
                    )
                );
            return {
                participantIdentifier,
                provider: provider.name,
                networkRegistrationStatus: 'NOT_REGISTERED' as const,
                success: true,
            };
        } catch (error) {
            await db
                .update(enterpriseEndpoints)
                .set({
                    networkRegistrationStatus: 'FAILED',
                    registrationProvider: provider.name,
                    registrationError: providerErrorMessage(error),
                })
                .where(
                    and(
                        eq(
                            enterpriseEndpoints.id,
                            input.participantIdentifierId
                        ),
                        eq(enterpriseEndpoints.enterpriseId, input.enterpriseId)
                    )
                );
            throwProviderFailure('deregister the participant', error);
        }
    });
