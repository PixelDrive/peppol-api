import { adminProcedure } from '../../../auth/admin';
import { addParticipantIdentifier } from './add-participant-identifier';
import { createApiKey } from './create-api-key';
import { createEnterprise } from './create-enterprise';
import { deregisterParticipant } from './deregister-participant';
import { deregisterParticipantService } from './deregister-participant-service';
import { getEnterprise } from './get-enterprise';
import { getParticipantRegistration } from './get-participant-registration';
import { listEnterprises } from './list-enterprises';
import { registerParticipant } from './register-participant';
import { registerParticipantService } from './register-participant-service';
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
        registerParticipant,
        getParticipantRegistration,
        deregisterParticipant,
        registerParticipantService,
        deregisterParticipantService,
    });
