import { describe, expect, it } from 'vitest';
import {
    normalizeBelgianEnterpriseNumber,
    toBelgianPeppolEndpoint,
} from '../src/lib/peppol-endpoint';

describe('Belgian Peppol EndpointID', () => {
    it.each([
        ['0732.788.875', '0732788875'],
        ['BE0732788875', '0732788875'],
        ['be 0732 788 875', '0732788875'],
    ])('normalizes %s to its BCE number', (input, expected) => {
        expect(normalizeBelgianEnterpriseNumber(input)).toBe(expected);
    });

    it('uses scheme 0208 for Belgian enterprises', () => {
        expect(toBelgianPeppolEndpoint('BE0732788875')).toEqual({
            scheme: '0208',
            value: '0732788875',
            canonical: '0208:0732788875',
        });
    });

    it('rejects malformed identifiers', () => {
        expect(() => normalizeBelgianEnterpriseNumber('BE123')).toThrow(
            'exactly 10 digits'
        );
    });
});
