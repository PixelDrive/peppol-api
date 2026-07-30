import { OpenAPIGenerator } from '@orpc/openapi';
import { OpenAPIHandler } from '@orpc/openapi/fetch';
import { ORPCError, ValidationError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { ZodSmartCoercionPlugin } from '@orpc/zod';
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { db } from './db/client';
import { logger } from './lib/logger';
import { createRequestLoggingMiddleware } from './middleware/request-logging';
import { providerWebhooksRouter } from './routes/provider-webhooks';
import { router } from './routers';

function logOrpcError(error: unknown): void {
    if (error instanceof ORPCError && error.cause instanceof ValidationError) {
        logger.warn(
            { issues: error.cause.issues },
            'oRPC request validation failed'
        );
        return;
    }
    logger.error({ error }, 'oRPC request failed');
}

const openApiHandler = new OpenAPIHandler(router, {
    plugins: [new ZodSmartCoercionPlugin()],
    interceptors: [
        async (options) => {
            try {
                return await options.next();
            } catch (error) {
                logOrpcError(error);
                throw error;
            }
        },
    ],
});
const rpcHandler = new RPCHandler(router, {
    interceptors: [
        async (options) => {
            try {
                return await options.next();
            } catch (error) {
                logOrpcError(error);
                throw error;
            }
        },
    ],
});
const openApiGenerator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
});

export const app = new Hono();

app.use('*', createRequestLoggingMiddleware(logger));

app.use(
    '*',
    cors({
        origin: (origin) => origin,
        allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowHeaders: [
            'content-type',
            'authorization',
            'x-api-key',
            'x-dokapi-signature',
        ],
        exposeHeaders: ['x-request-id'],
        credentials: true,
    })
);

app.onError((error, context) => {
    logger.error(
        { error, method: context.req.method, path: context.req.path },
        'Unhandled HTTP error'
    );
    return context.json({ error: 'Internal server error' }, 500);
});

app.route('/webhooks/providers', providerWebhooksRouter);

app.all('/rpc/*', async (context) => {
    const { matched, response } = await rpcHandler.handle(context.req.raw, {
        prefix: '/rpc',
        context: {
            headers: context.req.raw.headers,
            db,
            logger,
        },
    });
    return matched ? response : context.notFound();
});

app.get('/openapi.json', async (context) => {
    const specification = await openApiGenerator.generate(router, {
        info: {
            title: 'Provider-agnostic Peppol API',
            description:
                'Multi-tenant Peppol abstraction with participant identifier isolation, SML/SMP discovery, KoSIT validation and signed webhooks.',
            version: '0.1.0',
        },
        servers: [{ url: '/api' }],
        components: {
            securitySchemes: {
                EnterpriseApiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                },
                AdminBearer: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'opaque',
                },
            },
        },
    });
    return context.json(specification);
});

app.all('/api/*', async (context) => {
    const { matched, response } = await openApiHandler.handle(context.req.raw, {
        prefix: '/api',
        context: {
            headers: context.req.raw.headers,
            db,
            logger,
        },
    });
    return matched ? response : context.notFound();
});

app.get('/', (context) =>
    context.html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Peppol API</title>
</head>
<body>
  <div id="app"></div>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  <script>
    Scalar.createApiReference('#app', {
      url: '/openapi.json',
      theme: 'purple',
      showDeveloperTools: 'never'
    })
  </script>
</body>
</html>`)
);
