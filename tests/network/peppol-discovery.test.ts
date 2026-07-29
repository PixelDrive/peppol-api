import { beforeAll, describe, expect, it } from 'vitest';
import { lookupPeppolParticipant } from '../../src/peppol/discovery';

beforeAll(() => {
    process.env.ENCRYPTION_SECRET = 'a'.repeat(64);
});

const networkTest = process.env.RUN_NETWORK_TESTS === 'true' ? it : it.skip;

describe('Peppol production network discovery', () => {
    networkTest(
        'finds enterprise 0732788874 as Belgian participant 0208:0732788874',
        async () => {
            const result = await lookupPeppolParticipant('0732788874');

            expect(result.participant.canonical).toBe('0208:0732788874');
            expect(result.registered).toBe(true);
            expect(result.smp).not.toBeNull();
            expect(result.smp!.serviceCount).toBeGreaterThan(0);
            expect(result.documentTypes.length).toBeGreaterThan(0);
        },
        20_000
    );
});
