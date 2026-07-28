import { randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { ORPCError } from '@orpc/server';
import { base } from './base';
import { getConfig } from '../config';
import type { Database } from '../db/client';
import { adminSessions, adminUsers } from '../db/schema';
import { digestSecret, hashSecret, verifySecret } from '../lib/crypto';

const bearerPattern = /^Bearer\s+(.+)$/i;

/**
 * Ensures the optional environment-defined bootstrap administrator exists.
 * Updating ADMIN_PASSWORD also rotates that account's password on restart.
 */
export async function ensureBootstrapAdmin(db: Database): Promise<void> {
    const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password } = getConfig();
    if (!email || !password) {
        return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.email, normalizedEmail))
        .limit(1);

    if (!existing) {
        await db.insert(adminUsers).values({
            email: normalizedEmail,
            passwordHash: await hashSecret(password),
        });
        return;
    }

    if (!(await verifySecret(password, existing.passwordHash))) {
        await db.transaction(async (transaction) => {
            await transaction
                .update(adminUsers)
                .set({
                    passwordHash: await hashSecret(password),
                    updatedAt: new Date(),
                })
                .where(eq(adminUsers.id, existing.id));
            await transaction
                .delete(adminSessions)
                .where(eq(adminSessions.adminUserId, existing.id));
        });
    }
}

/**
 * Authenticates an administrator and returns a short-lived opaque bearer token.
 */
export async function createAdminSession(
    db: Database,
    email: string,
    password: string
): Promise<{ token: string; expiresAt: Date }> {
    const [admin] = await db
        .select()
        .from(adminUsers)
        .where(eq(adminUsers.email, email.trim().toLowerCase()))
        .limit(1);

    if (!admin?.active || !(await verifySecret(password, admin.passwordHash))) {
        throw new ORPCError('UNAUTHORIZED', {
            message: 'Invalid administrator credentials',
        });
    }

    const token = `pa_admin_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(
        Date.now() + getConfig().ADMIN_SESSION_TTL_HOURS * 60 * 60 * 1000
    );
    await db.insert(adminSessions).values({
        adminUserId: admin.id,
        tokenHash: digestSecret(token),
        expiresAt,
    });

    return { token, expiresAt };
}

async function authorizeAdmin(headers: Headers, db: Database) {
    const authorization = headers.get('authorization');
    const token = authorization
        ? bearerPattern.exec(authorization)?.[1]
        : undefined;
    if (!token) {
        throw new ORPCError('UNAUTHORIZED');
    }

    const [result] = await db
        .select({ admin: adminUsers, session: adminSessions })
        .from(adminSessions)
        .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminUserId))
        .where(
            and(
                eq(adminSessions.tokenHash, digestSecret(token)),
                gt(adminSessions.expiresAt, new Date()),
                eq(adminUsers.active, true)
            )
        )
        .limit(1);

    if (!result) {
        throw new ORPCError('UNAUTHORIZED');
    }
    return result;
}

export const adminProcedure = base.use(
    base.middleware(async ({ context, next }) =>
        next({
            context: {
                ...(await authorizeAdmin(context.headers, context.db)),
            },
        })
    )
);
