import { ORPCError } from '@orpc/server';
import { adminProcedure } from '../../../auth/admin';
import { getProvider } from '../../../providers/factory';
import {
    getEnterpriseParticipant,
    throwProviderFailure,
    toParticipantIdentifier,
} from './participant-registration-helpers';
import { participantServiceRemovalInputSchema } from './participant-registration-schemas';

export const deregisterParticipantService = adminProcedure
    .route({
        method: 'DELETE',
        path: '/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-services',
        summary: 'Deregister a participant document service',
        description:
            'Removes a published document type from the participant through the configured provider.',
    })
    .input(participantServiceRemovalInputSchema)
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
                    'The participant must be registered on the network before removing document services.',
            });
        }
        const provider = await getProvider(db, target.enterprise);
        const participantIdentifier = toParticipantIdentifier(
            target.participantIdentifier
        );
        try {
            await provider.deregisterParticipantService(participantIdentifier, {
                documentTypeIdentifier: input.documentTypeIdentifier,
                documentTypeScheme: input.documentTypeScheme,
            });
            return {
                participantIdentifier,
                provider: provider.name,
                documentTypeIdentifier: input.documentTypeIdentifier,
                documentTypeScheme: input.documentTypeScheme,
                success: true,
            };
        } catch (error) {
            throwProviderFailure(
                'deregister the participant document service',
                error
            );
        }
    });
