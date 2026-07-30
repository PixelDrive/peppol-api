import { and, eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { adminProcedure } from '../../../auth/admin';
import { enterpriseEndpoints, enterprises } from '../../../db/schema';
import { normalizePeppolParticipantIdentifier } from '../../../lib/peppol-endpoint';
import { addParticipantIdentifierOutputSchema } from '../../output-schemas';

export const addParticipantIdentifier = adminProcedure
    .route({
        method: 'POST',
        path: '/{enterpriseId}/participant-identifiers',
        summary: 'Add an enterprise participant identifier',
        description:
            'Registers another Peppol participant identifier for inbound routing and outbound sender authorization.',
    })
    .input(
        z.object({
            enterpriseId: z.uuid(),
            participantId: z.string().trim().min(1),
        })
    )
    .output(addParticipantIdentifierOutputSchema)
    .handler(async ({ context: { db }, input }) => {
        let participantIdentifier;
        try {
            participantIdentifier = normalizePeppolParticipantIdentifier(
                input.participantId
            );
        } catch (error) {
            throw new ORPCError('BAD_REQUEST', {
                message:
                    error instanceof Error
                        ? error.message
                        : 'Invalid Peppol participant identifier.',
                cause: error,
            });
        }
        const [enterprise] = await db
            .select({ id: enterprises.id })
            .from(enterprises)
            .where(eq(enterprises.id, input.enterpriseId))
            .limit(1);
        if (!enterprise) {
            throw new ORPCError('NOT_FOUND');
        }

        const [existing] = await db
            .select()
            .from(enterpriseEndpoints)
            .where(
                and(
                    eq(
                        enterpriseEndpoints.scheme,
                        participantIdentifier.scheme
                    ),
                    eq(enterpriseEndpoints.value, participantIdentifier.value)
                )
            )
            .limit(1);
        if (existing) {
            if (existing.enterpriseId !== input.enterpriseId) {
                throw new ORPCError('CONFLICT', {
                    message:
                        'This participant identifier is already registered to another enterprise.',
                });
            }
            return {
                ...existing,
                canonical: participantIdentifier.canonical,
                alreadyRegistered: true,
            };
        }

        const [created] = await db
            .insert(enterpriseEndpoints)
            .values({
                enterpriseId: input.enterpriseId,
                scheme: participantIdentifier.scheme,
                value: participantIdentifier.value,
            })
            .onConflictDoNothing()
            .returning();
        if (!created) {
            throw new ORPCError('CONFLICT', {
                message:
                    'This participant identifier was registered concurrently.',
            });
        }
        return {
            ...created,
            canonical: participantIdentifier.canonical,
            alreadyRegistered: false,
        };
    });
