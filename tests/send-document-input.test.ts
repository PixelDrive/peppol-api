import { describe, expect, it } from 'vitest';
import testInvoicePayload from '../examples/invoice-simon-loir-thiagency.json';
import {
    resolveSendDocumentXml,
    sendDocumentInputSchema,
} from '../src/routers/documents/send-document-input';
import { parseUblDocument } from '../src/peppol/xml';

describe('send document input', () => {
    it('preserves an XML document unchanged', () => {
        const input = sendDocumentInputSchema.parse({
            ublXml: '<Invoice>test</Invoice>',
            externalReference: 'xml-test',
            validate: false,
        });

        expect(resolveSendDocumentXml(input)).toBe('<Invoice>test</Invoice>');
    });

    it('generates UBL XML from an Invoice DTO', () => {
        const input = sendDocumentInputSchema.parse(testInvoicePayload);
        const ublXml = resolveSendDocumentXml(input);

        expect(parseUblDocument(ublXml)).toMatchObject({
            type: 'INVOICE',
            documentId: 'TEST-PEPPOL-2026-001',
            senderEndpoint: '0208:0732788874',
            receiverEndpoint: '0208:1022713956',
            senderCountryCode: 'BE',
        });
    });

    it('rejects ambiguous and missing document payloads', () => {
        expect(
            sendDocumentInputSchema.safeParse({
                ...testInvoicePayload,
                ublXml: '<Invoice />',
            }).success
        ).toBe(false);
        expect(
            sendDocumentInputSchema.safeParse({
                externalReference: 'missing-document',
            }).success
        ).toBe(false);
    });
});
