import { invoiceSchema } from '@pixeldrive/peppol-toolkit';
import { z } from 'zod';
import { generateUblXml } from '../../peppol/xml';

const ublXmlSchema = z.string().min(1).max(5_000_000);
const sendOptionsShape = {
    externalReference: z.string().trim().max(200).optional(),
    validate: z.boolean().optional(),
};

const xmlSendDocumentInputSchema = z.object({
    ...sendOptionsShape,
    ublXml: ublXmlSchema,
    type: z.never().optional(),
    document: z.never().optional(),
});

const invoiceSendDocumentInputSchema = z.object({
    ...sendOptionsShape,
    type: z.literal('INVOICE'),
    document: invoiceSchema,
    ublXml: z.never().optional(),
});

export const sendDocumentInputSchema = z.union([
    xmlSendDocumentInputSchema,
    invoiceSendDocumentInputSchema,
]);

export type SendDocumentInput = z.infer<typeof sendDocumentInputSchema>;

/**
 * Resolves either accepted send payload into the final UBL XML that is used
 * for authorization, validation, persistence and provider submission.
 */
export function resolveSendDocumentXml(input: SendDocumentInput): string {
    const ublXml =
        input.ublXml ??
        generateUblXml({
            type: 'INVOICE',
            document: input.document,
        });
    return ublXmlSchema.parse(ublXml);
}
