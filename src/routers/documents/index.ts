import { enterpriseProcedure } from '../../auth/enterprise';
import { generateDocument } from './generate-document';
import { getDocument } from './get-document';
import { listDocuments } from './list-documents';
import { sendDocument } from './send-document';
import { validateDocument } from './validate-document';

export const documentsRouter = enterpriseProcedure
    .prefix('/documents')
    .tag('Documents')
    .router({
        generate: generateDocument,
        validate: validateDocument,
        send: sendDocument,
        list: listDocuments,
        get: getDocument,
    });
