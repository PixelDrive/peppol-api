import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createRequestLoggingMiddleware } from '../src/middleware/request-logging';

describe('HTTP request logging', () => {
    it('logs operational metadata without private request data', async () => {
        const info = vi.fn();
        const app = new Hono();
        app.use('*', createRequestLoggingMiddleware({ info }));
        app.post('/documents', (context) =>
            context.json({ received: true }, 201)
        );

        const response = await app.request(
            '/documents?participantId=0208%3A0732788874',
            {
                method: 'POST',
                headers: {
                    authorization: 'Bearer private-token',
                    'content-type': 'application/xml',
                    'x-api-key': 'private-api-key',
                },
                body: '<Invoice>private contents</Invoice>',
            }
        );

        expect(response.status).toBe(201);
        expect(info).toHaveBeenCalledOnce();
        expect(info).toHaveBeenCalledWith(
            {
                requestId: expect.any(String),
                method: 'POST',
                path: '/documents',
                status: 201,
                durationMs: expect.any(Number),
            },
            'HTTP request completed'
        );
        expect(response.headers.get('x-request-id')).toBe(
            info.mock.calls[0]?.[0].requestId
        );
        expect(JSON.stringify(info.mock.calls)).not.toContain('private');
        expect(JSON.stringify(info.mock.calls)).not.toContain('participantId');
    });

    it('logs status 500 when downstream processing throws', async () => {
        const info = vi.fn();
        const app = new Hono();
        app.use('*', createRequestLoggingMiddleware({ info }));
        app.get('/failure', () => {
            throw new Error('private failure details');
        });
        app.onError((_error, context) =>
            context.json({ error: 'Internal server error' }, 500)
        );

        const response = await app.request('/failure');

        expect(response.status).toBe(500);
        expect(info).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'GET',
                path: '/failure',
                status: 500,
            }),
            'HTTP request completed'
        );
        expect(JSON.stringify(info.mock.calls)).not.toContain(
            'private failure details'
        );
    });
});
