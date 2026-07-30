import { describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config';

const encryptionSecret = 'a'.repeat(64);

describe('optional provider configuration', () => {
    it('treats empty Dokapi values as unconfigured', () => {
        const config = parseConfig({
            ENCRYPTION_SECRET: encryptionSecret,
            DOKAPI_CLIENT_ID: '',
            DOKAPI_CLIENT_SECRET: '   ',
            DOKAPI_BASE_URL: '',
            DOKAPI_TOKEN_URL: '',
            DOKAPI_WEBHOOK_SECRET: '',
        });

        expect(config.DOKAPI_CLIENT_ID).toBeUndefined();
        expect(config.DOKAPI_CLIENT_SECRET).toBeUndefined();
        expect(config.DOKAPI_WEBHOOK_SECRET).toBeUndefined();
        expect(config.DOKAPI_BASE_URL).toBe(
            'https://peppol-api.dokapi-stg.io/v1'
        );
        expect(config.DOKAPI_TOKEN_URL).toBe(
            'https://dev-portal.dokapi.io/api/oauth2/token'
        );
    });
});
