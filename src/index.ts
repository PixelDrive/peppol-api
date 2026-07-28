import '@dotenvx/dotenvx/config';
import { serve } from '@hono/node-server';
import { app } from './app';
import { ensureBootstrapAdmin } from './auth/admin';
import { getConfig } from './config';
import { db } from './db/client';
import { migrateDatabase } from './db/migrate';
import { logger } from './lib/logger';
import { startWebhookWorker } from './webhooks/delivery';

async function main(): Promise<void> {
    if (getConfig().RUN_MIGRATIONS) {
        await migrateDatabase(db);
    }
    await ensureBootstrapAdmin(db);
    startWebhookWorker(db, logger);
    const { PORT: port } = getConfig();
    serve({ fetch: app.fetch, port }, () => {
        logger.info(
            { port, docs: `http://localhost:${port}` },
            'Peppol API started'
        );
    });
}

try {
    await main();
} catch (error) {
    logger.fatal({ error }, 'Unable to start Peppol API');
    process.exitCode = 1;
}
