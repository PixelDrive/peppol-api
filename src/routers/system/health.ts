import { z } from 'zod';
import { base } from '../../auth/base';

export const health = base
    .route({
        method: 'GET',
        path: '/health',
        tags: ['System'],
        summary: 'Health check',
    })
    .output(z.object({ status: z.literal('ok') }))
    .handler(() => ({ status: 'ok' as const }));
