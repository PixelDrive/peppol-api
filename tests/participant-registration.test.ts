import { describe, expect, it } from 'vitest';
import {
    participantRegistrationInputSchema,
    participantServiceInputSchema,
} from '../src/routers/admin/enterprises/participant-registration-schemas';

const pathInput = {
    enterpriseId: '1ee9f287-9a48-45f7-a8c4-84a8f3334a75',
    participantIdentifierId: '068bb849-2c96-4432-bfd5-66ef99bf81b9',
};

describe('participant network registration input', () => {
    it('normalizes country and language codes and enables directory publication', () => {
        expect(
            participantRegistrationInputSchema.parse({
                ...pathInput,
                countryCode: 'be',
                businessCard: { language: 'EN' },
            })
        ).toMatchObject({
            countryCode: 'BE',
            businessCard: { language: 'en' },
            publishToDirectory: true,
        });
    });

    it('rejects an invalid country code', () => {
        expect(
            participantRegistrationInputSchema.safeParse({
                ...pathInput,
                countryCode: 'Belgium',
            }).success
        ).toBe(false);
    });

    it('uses the standard Peppol document and process schemes', () => {
        expect(
            participantServiceInputSchema.parse({
                ...pathInput,
                documentTypeIdentifier: 'invoice-document-type',
                processIdentifier: 'billing-process',
            })
        ).toMatchObject({
            documentTypeScheme: 'busdox-docid-qns',
            processScheme: 'cenbii-procid-ubl',
        });
    });
});
