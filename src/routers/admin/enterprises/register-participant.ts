import { and, eq, notInArray } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseEndpoints } from '../../../db/schema';
import { getProvider } from '../../../providers/factory';
import { registerParticipantOutputSchema } from '../../output-schemas';
import {
    getEnterpriseParticipant,
    providerErrorMessage,
    throwProviderFailure,
    toParticipantIdentifier,
} from './participant-registration-helpers';
import { participantRegistrationInputSchema } from './participant-registration-schemas';

export const registerParticipant = adminProcedure
    .route({
        method: 'POST',
        path: '/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-registration',
        summary: 'Register a participant on the Peppol network',
        description:
            'Registers the locally owned participant through the configured provider, creates or updates its business card and optionally publishes it to the Peppol Directory.',
    })
    .input(participantRegistrationInputSchema)
    .output(registerParticipantOutputSchema)
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
        const attemptedAt = new Date();
        const [claimed] = await db
            .update(enterpriseEndpoints)
            .set({
                networkRegistrationStatus: 'REGISTERING',
                registrationAttemptedAt: attemptedAt,
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
            const result = await provider.registerParticipant({
                participantIdentifier,
                businessCard: {
                    ...input.businessCard,
                    name: input.businessCard.name ?? target.enterprise.name,
                    countryCode: input.countryCode,
                },
                publishToDirectory: input.publishToDirectory,
            });
            const status = result.partial ? 'PARTIAL' : 'REGISTERED';
            await db
                .update(enterpriseEndpoints)
                .set({
                    networkRegistrationStatus: status,
                    registrationProvider: provider.name,
                    providerRegistrationId:
                        result.providerRegistrationId ?? null,
                    registrationDetails: result.providerDetails ?? null,
                    registeredAt: new Date(),
                    registrationError: result.errors?.join('\n') ?? null,
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
                networkRegistrationStatus: status,
                ...result,
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
            throwProviderFailure('register the participant', error);
        }
    });
