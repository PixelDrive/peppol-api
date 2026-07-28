import { enterpriseProcedure } from '../../auth/enterprise';
import { assertSenderBelongsToEnterprise } from '../../peppol/authorization';
import {
    generateUblXml,
    parseUblDocument,
    structuredDocumentSchema,
} from '../../peppol/xml';

export const generateDocument = enterpriseProcedure
    .route({
        method: 'POST',
        path: '/generate',
        summary: 'Generate Peppol UBL XML',
        description:
            'Builds an invoice or credit note with peppol-toolkit and verifies its supplier EndpointID.',
    })
    .input(structuredDocumentSchema)
    .handler(async ({ context: { db, enterprise }, input }) => {
        const ublXml = generateUblXml(input);
        const metadata = parseUblDocument(ublXml);
        await assertSenderBelongsToEnterprise(
            db,
            enterprise.id,
            metadata.senderEndpoint
        );
        return { ublXml, ...metadata };
    });
