import { ORPCError } from '@orpc/server';
import { adminProcedure } from '../../../auth/admin';
import { getProvider } from '../../../providers/factory';
import { registerParticipantServiceOutputSchema } from '../../output-schemas';
import {
    getEnterpriseParticipant,
    throwProviderFailure,
    toParticipantIdentifier,
} from './participant-registration-helpers';
import { participantServiceInputSchema } from './participant-registration-schemas';

export const registerParticipantService = adminProcedure
    .route({
        method: 'POST',
        path: '/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-services',
        summary: 'Register a participant document service',
        description:
            'Publishes a document type and process pair for a registered participant through the configured provider.',
    })
    .input(participantServiceInputSchema)
    .output(registerParticipantServiceOutputSchema)
    .handler(async ({ context: { db }, input }) => {
        const target = await getEnterpriseParticipant(
            db,
            input.enterpriseId,
            input.participantIdentifierId
        );
        if (
            target.participantIdentifier.networkRegistrationStatus !==
                'REGISTERED' &&
            target.participantIdentifier.networkRegistrationStatus !== 'PARTIAL'
        ) {
            throw new ORPCError('PRECONDITION_FAILED', {
                message:
                    'The participant must be registered on the network before publishing document services.',
            });
        }
        const provider = await getProvider(db, target.enterprise);
        const participantIdentifier = toParticipantIdentifier(
            target.participantIdentifier
        );
        try {
            const providerDetails = await provider.registerParticipantService(
                participantIdentifier,
                {
                    documentTypeIdentifier: input.documentTypeIdentifier,
                    documentTypeScheme: input.documentTypeScheme,
                    processIdentifier: input.processIdentifier,
                    processScheme: input.processScheme,
                }
            );
            return {
                participantIdentifier,
                provider: provider.name,
                service: {
                    documentTypeIdentifier: input.documentTypeIdentifier,
                    documentTypeScheme: input.documentTypeScheme,
                    processIdentifier: input.processIdentifier,
                    processScheme: input.processScheme,
                },
                providerDetails,
                success: true,
            };
        } catch (error) {
            throwProviderFailure(
                'register the participant document service',
                error
            );
        }
    });
