import type { MiddlewareHandler } from 'hono';

type RequestLogger = {
    info(
        context: Record<string, unknown>,
        message: 'HTTP request completed'
    ): void;
};

/**
 * Logs privacy-safe HTTP request metadata without headers, query parameters,
 * bodies, credentials or document contents.
 */
export function createRequestLoggingMiddleware(
    logger: RequestLogger
): MiddlewareHandler {
    return async (context, next) => {
        const requestId = crypto.randomUUID();
        const startedAt = performance.now();
        let failed = false;
        context.header('x-request-id', requestId);

        try {
            await next();
        } catch (error) {
            failed = true;
            throw error;
        } finally {
            logger.info(
                {
                    requestId,
                    method: context.req.method,
                    path: context.req.path,
                    status: failed ? 500 : context.res.status,
                    durationMs:
                        Math.round((performance.now() - startedAt) * 100) / 100,
                },
                'HTTP request completed'
            );
        }
    };
}
