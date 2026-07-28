import { describe, expect, it } from 'vitest';
import { enterpriseInputSchema } from '../src/routers/admin/enterprises/schemas';

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
});
