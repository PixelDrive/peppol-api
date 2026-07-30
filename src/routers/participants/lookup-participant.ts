import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import {
    lookupPeppolParticipant,
    PeppolDiscoveryError,
} from '../../peppol/discovery';
import { participantLookupOutputSchema } from '../output-schemas';

export const lookupParticipant = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/lookup',
        summary: 'Look up a participant on the Peppol network',
        description:
            'Queries the Peppol SML and SMP directly to determine whether a participant is registered and which document types it advertises.',
    })
    .input(
        z.object({
            participantId: z
                .string()
                .trim()
                .min(1)
                .max(135)
                .describe(
                    'Canonical Peppol participant ID such as 0208:0732788875; a Belgian BCE/KBO or VAT number is also accepted'
                ),
        })
    )
    .output(participantLookupOutputSchema)
    .handler(async ({ context: { logger }, input }) => {
        try {
            return await lookupPeppolParticipant(input.participantId);
        } catch (error) {
            if (error instanceof PeppolDiscoveryError) {
                logger.warn(
                    {
                        participantId: input.participantId,
                        discoveryCode: error.code,
                        error,
                    },
                    'Peppol participant discovery failed'
                );
                throw new ORPCError('BAD_GATEWAY', {
                    message: error.message,
                    data: { discoveryCode: error.code },
                });
            }
            if (error instanceof Error) {
                throw new ORPCError('BAD_REQUEST', {
                    message: error.message,
                });
            }
            throw error;
        }
    });
