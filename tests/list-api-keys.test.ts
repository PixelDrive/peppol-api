import { describe, expect, it } from 'vitest';
import { enterpriseApiKeySummarySelection } from '../src/routers/admin/enterprises/list-api-keys';

describe('list enterprise API keys', () => {
    it('selects operational metadata without hashes or secrets', () => {
        expect(Object.keys(enterpriseApiKeySummarySelection)).toEqual([
            'id',
            'prefix',
            'active',
            'lastUsedAt',
            'expiresAt',
            'createdAt',
        ]);
        expect(enterpriseApiKeySummarySelection).not.toHaveProperty('keyHash');
        expect(enterpriseApiKeySummarySelection).not.toHaveProperty('apiKey');
    });
});
