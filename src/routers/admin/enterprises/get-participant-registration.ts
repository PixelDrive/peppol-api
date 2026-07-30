import { and, eq } from 'drizzle-orm';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseEndpoints } from '../../../db/schema';
import { getProvider } from '../../../providers/factory';
import { getParticipantRegistrationOutputSchema } from '../../output-schemas';
import {
    getEnterpriseParticipant,
    providerErrorMessage,
    throwProviderFailure,
    toParticipantIdentifier,
} from './participant-registration-helpers';
import { participantRegistrationPathSchema } from './participant-registration-schemas';

export const getParticipantRegistration = adminProcedure
    .route({
        method: 'GET',
        path: '/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-registration',
        summary: 'Get participant network registration',
        description:
            'Refreshes the registration from the configured provider and returns both provider and locally persisted state.',
    })
    .input(participantRegistrationPathSchema)
    .output(getParticipantRegistrationOutputSchema)
    .handler(async ({ context: { db }, input }) => {
        const target = await getEnterpriseParticipant(
            db,
            input.enterpriseId,
            input.participantIdentifierId
        );
        const provider = await getProvider(db, target.enterprise);
        const participantIdentifier = toParticipantIdentifier(
            target.participantIdentifier
        );

        try {
            const providerStatus = await provider.getParticipantRegistration(
                participantIdentifier
            );
            const networkRegistrationStatus = providerStatus.registered
                ? target.participantIdentifier.networkRegistrationStatus ===
                  'PARTIAL'
                    ? 'PARTIAL'
                    : 'REGISTERED'
                : 'NOT_REGISTERED';
            await db
                .update(enterpriseEndpoints)
                .set({
                    networkRegistrationStatus,
                    registrationProvider: providerStatus.registered
                        ? provider.name
                        : null,
                    providerRegistrationId:
                        providerStatus.providerRegistrationId ?? null,
                    registrationDetails: providerStatus.providerDetails ?? null,
                    registeredAt:
                        providerStatus.registered &&
                        !target.participantIdentifier.registeredAt
                            ? new Date()
                            : target.participantIdentifier.registeredAt,
                    registrationAttemptedAt: new Date(),
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
                networkRegistrationStatus,
                providerStatus,
            };
        } catch (error) {
            await db
                .update(enterpriseEndpoints)
                .set({
                    registrationAttemptedAt: new Date(),
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
            throwProviderFailure('read the participant registration', error);
        }
    });
