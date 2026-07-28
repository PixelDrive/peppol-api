import pino from 'pino';
import { getConfig } from '../config';

export const logger = pino({
    level: getConfig().LOG_LEVEL,
    redact: {
        paths: [
            'password',
            '*.password',
            'clientSecret',
            '*.clientSecret',
            'authorization',
            '*.authorization',
            'x-api-key',
            '*.x-api-key',
        ],
        censor: '[REDACTED]',
    },
});
