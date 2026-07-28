import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getConfig } from '../config';
import * as schema from './schema';

const globalDatabase = globalThis as unknown as {
    peppolSql?: ReturnType<typeof postgres>;
    peppolDatabase?: ReturnType<typeof drizzle<typeof schema>>;
};

const sql =
    globalDatabase.peppolSql ??
    postgres(getConfig().DATABASE_URL, {
        max: getConfig().NODE_ENV === 'test' ? 1 : 10,
        prepare: false,
    });

export const db =
    globalDatabase.peppolDatabase ??
    drizzle(sql, { schema, casing: 'snake_case' });

if (getConfig().NODE_ENV !== 'production') {
    globalDatabase.peppolSql = sql;
    globalDatabase.peppolDatabase = db;
}

export type Database = typeof db;
