import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { enterpriseProcedure } from '../../auth/enterprise';
import { getConfig } from '../../config';
import { webhookEndpoints } from '../../db/schema';
import { encrypt } from '../../lib/crypto';
import { webhookEventTypes } from '../../webhooks/events';

export const createWebhookEndpoint = enterpriseProcedure
    .route({
        method: 'POST',
        path: '/',
        summary: 'Create a client webhook endpoint',
        description:
            'Returns the signing secret once. Deliveries use HMAC-SHA256 over timestamp.payload.',
    })
    .input(
        z.object({
            url: z.url(),
            events: z
                .array(z.enum(webhookEventTypes))
                .min(1)
                .default([...webhookEventTypes]),
        })
    )
    .handler(async ({ context: { db, enterprise }, input }) => {
        const parsedUrl = new URL(input.url);
        if (
            getConfig().NODE_ENV === 'production' &&
            parsedUrl.protocol !== 'https:'
        ) {
            throw new Error('Webhook URLs must use HTTPS in production');
        }

        const secret = `whsec_${randomBytes(32).toString('base64url')}`;
        const [endpoint] = await db
            .insert(webhookEndpoints)
            .values({
                enterpriseId: enterprise.id,
                url: input.url,
                events: input.events,
                encryptedSecret: encrypt(secret),
            })
            .returning({
                id: webhookEndpoints.id,
                url: webhookEndpoints.url,
                events: webhookEndpoints.events,
                active: webhookEndpoints.active,
                createdAt: webhookEndpoints.createdAt,
            });
        return {
            ...endpoint!,
            secret,
            warning:
                'This signing secret is only returned once. Store it securely.',
        };
    });
