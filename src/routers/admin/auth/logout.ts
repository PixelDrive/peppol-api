import { eq } from 'drizzle-orm';
import { adminProcedure } from '../../../auth/admin';
import { adminSessions } from '../../../db/schema';

export const logout = adminProcedure
    .route({
        method: 'POST',
        path: '/logout',
        summary: 'Close the current administrator session',
    })
    .handler(async ({ context: { db, session } }) => {
        await db.delete(adminSessions).where(eq(adminSessions.id, session.id));
        return { success: true };
    });
