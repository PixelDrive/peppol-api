import { adminProcedure } from '../../../auth/admin';
import { addParticipantIdentifier } from './add-participant-identifier';
import { createApiKey } from './create-api-key';
import { createEnterprise } from './create-enterprise';
import { getEnterprise } from './get-enterprise';
import { listEnterprises } from './list-enterprises';
import { revokeApiKey } from './revoke-api-key';
import { removeParticipantIdentifier } from './remove-participant-identifier';
import { updateProvider } from './update-provider';

export const adminEnterprisesRouter = adminProcedure
    .prefix('/admin/enterprises')
    .tag('Admin enterprises')
    .router({
        create: createEnterprise,
        list: listEnterprises,
        get: getEnterprise,
        updateProvider,
        createApiKey,
        revokeApiKey,
        addParticipantIdentifier,
        removeParticipantIdentifier,
    });
