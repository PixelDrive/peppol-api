import { z } from 'zod';
import { base } from '../../../auth/base';
import { createAdminSession } from '../../../auth/admin';

export const login = base
    .route({
        method: 'POST',
        path: '/login',
        summary: 'Open an administrator session',
        description:
            'Authenticates the bootstrap administrator and returns an opaque bearer token.',
    })
    .input(
        z.object({
            email: z.email(),
            password: z.string().min(1),
        })
    )
    .handler(async ({ context: { db }, input }) => {
        const session = await createAdminSession(
            db,
            input.email,
            input.password
        );
        return {
            accessToken: session.token,
            tokenType: 'Bearer' as const,
            expiresAt: session.expiresAt,
        };
    });
