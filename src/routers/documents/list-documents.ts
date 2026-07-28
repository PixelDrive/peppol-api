import { and, desc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import { documents } from '../../db/schema';

export const listDocuments = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/',
        summary: 'List enterprise documents',
    })
    .input(
        z.object({
            cursor: z.iso.datetime().optional(),
            limit: z.coerce.number().int().min(1).max(100).default(25),
        })
    )
    .handler(async ({ context: { db, enterprise }, input }) => {
        const rows = await db
            .select({
                id: documents.id,
                type: documents.type,
                direction: documents.direction,
                status: documents.status,
                senderEndpoint: documents.senderEndpoint,
                receiverEndpoint: documents.receiverEndpoint,
                externalReference: documents.externalReference,
                providerDocumentId: documents.providerDocumentId,
                errorMessage: documents.errorMessage,
                createdAt: documents.createdAt,
                updatedAt: documents.updatedAt,
            })
            .from(documents)
            .where(
                and(
                    eq(documents.enterpriseId, enterprise.id),
                    input.cursor
                        ? lt(documents.createdAt, new Date(input.cursor))
                        : undefined
                )
            )
            .orderBy(desc(documents.createdAt))
            .limit(input.limit + 1);
        const hasMore = rows.length > input.limit;
        const items = hasMore ? rows.slice(0, input.limit) : rows;
        return {
            items,
            nextCursor: hasMore
                ? items.at(-1)?.createdAt.toISOString()
                : undefined,
        };
    });
