import { os } from '@orpc/server';
import type { Database } from '../db/client';
import type { logger } from '../lib/logger';

export type BaseContext = {
    headers: Headers;
    db: Database;
    logger: typeof logger;
};

export const base = os.$context<BaseContext>();
