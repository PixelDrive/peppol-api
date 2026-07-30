import { describe, expect, it } from 'vitest';
import {
    enterpriseInputSchema,
    resolveEnterpriseParticipantIdentifiers,
} from '../src/routers/admin/enterprises/schemas';

describe('enterprise registration input', () => {
    it('accepts a Belgian VAT number and derives the same BCE identity', () => {
        expect(
            enterpriseInputSchema.safeParse({
                name: 'Example SRL',
                vatNumber: 'BE0732788875',
            }).success
        ).toBe(true);
    });

    it('accepts a formatted BCE number', () => {
        expect(
            enterpriseInputSchema.safeParse({
                name: 'Example SRL',
                companyNumber: '0732.788.875',
            }).success
        ).toBe(true);
    });

    it('rejects mismatched BCE and VAT values', () => {
        const result = enterpriseInputSchema.safeParse({
            name: 'Example SRL',
            companyNumber: '0732788875',
            vatNumber: 'BE0123456789',
        });
        expect(result.success).toBe(false);
    });

    it('rejects a VAT value without the BE country prefix', () => {
        const result = enterpriseInputSchema.safeParse({
            name: 'Example SRL',
            vatNumber: '0732788875',
        });
        expect(result.success).toBe(false);
    });

    it('accepts a primary and additional participant identifiers', () => {
        const result = enterpriseInputSchema.safeParse({
            name: 'International Example',
            participantId: '0088:1234567890123',
            additionalParticipantIds: ['0208:0732788874', '9925:BE0732788874'],
        });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(
                resolveEnterpriseParticipantIdentifiers(result.data)
            ).toEqual([
                {
                    scheme: '0088',
                    value: '1234567890123',
                    canonical: '0088:1234567890123',
                },
                {
                    scheme: '0208',
                    value: '0732788874',
                    canonical: '0208:0732788874',
                },
                {
                    scheme: '9925',
                    value: 'be0732788874',
                    canonical: '9925:be0732788874',
                },
            ]);
        }
    });

    it('rejects identifiers duplicated after normalization', () => {
        const result = enterpriseInputSchema.safeParse({
            name: 'Example SRL',
            participantId: '9925:BE0732788874',
            additionalParticipantIds: ['9925:be0732788874'],
        });
        expect(result.success).toBe(false);
    });

    it('requires an explicit participant for non-Belgian metadata', () => {
        expect(
            enterpriseInputSchema.safeParse({
                name: 'International Example',
            }).success
        ).toBe(false);
    });
});
