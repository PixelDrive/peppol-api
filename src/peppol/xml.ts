import {
    creditNoteSchema,
    invoiceSchema,
    PeppolToolkit,
    type CreditNote,
    type Invoice,
} from '@pixeldrive/peppol-toolkit';
import { z } from 'zod';
import { canonicalEndpoint } from '../lib/peppol-endpoint';

const toolkit = new PeppolToolkit();

export const structuredDocumentSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('INVOICE'),
        document: invoiceSchema,
    }),
    z.object({
        type: z.literal('CREDIT_NOTE'),
        document: creditNoteSchema,
    }),
]);

export type StructuredDocument = z.infer<typeof structuredDocumentSchema>;

export type ParsedPeppolDocument = {
    type: 'INVOICE' | 'CREDIT_NOTE';
    senderEndpoint: string;
    receiverEndpoint: string;
    senderCountryCode: string;
    documentId: string;
};

/**
 * Generates UBL XML through peppol-toolkit from validated structured data.
 */
export function generateUblXml(input: StructuredDocument): string {
    return input.type === 'INVOICE'
        ? toolkit.invoiceToPeppolUBL(input.document as Invoice)
        : toolkit.creditNoteToPeppolUBL(input.document as CreditNote);
}

/**
 * Parses a UBL invoice or credit note and extracts the routing metadata.
 */
export function parseUblDocument(xml: string): ParsedPeppolDocument {
    const looksLikeCreditNote = /<(?:\w+:)?CreditNote(?:\s|>)/i.test(xml);
    const type = looksLikeCreditNote ? 'CREDIT_NOTE' : 'INVOICE';
    const document = looksLikeCreditNote
        ? toolkit.peppolUBLToCreditNote(xml)
        : toolkit.peppolUBLToInvoice(xml);

    if (
        !document.seller.endPoint?.scheme ||
        !document.seller.endPoint.id ||
        !document.buyer.endPoint?.scheme ||
        !document.buyer.endPoint.id
    ) {
        throw new Error(
            'UBL document must contain supplier and customer EndpointID values'
        );
    }

    return {
        type,
        senderEndpoint: canonicalEndpoint(document.seller.endPoint),
        receiverEndpoint: canonicalEndpoint(document.buyer.endPoint),
        senderCountryCode: document.seller.address.country.toUpperCase(),
        documentId: document.ID,
    };
}
