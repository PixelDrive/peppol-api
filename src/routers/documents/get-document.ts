import { and, eq } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import { documents } from '../../db/schema';

export const getDocument = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/{documentId}',
        summary: 'Get an enterprise document',
    })
    .input(z.object({ documentId: z.uuid() }))
    .handler(async ({ context: { db, enterprise }, input }) => {
        const [document] = await db
            .select()
            .from(documents)
            .where(
                and(
                    eq(documents.id, input.documentId),
                    eq(documents.enterpriseId, enterprise.id)
                )
            )
            .limit(1);
        if (!document) {
            throw new ORPCError('NOT_FOUND');
        }
        return document;
    });
