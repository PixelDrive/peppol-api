import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client';

/**
 * Applies checked-in Drizzle migrations before the HTTP server starts.
 */
export async function migrateDatabase(db: Database): Promise<void> {
    await migrate(db, { migrationsFolder: './drizzle' });
}
