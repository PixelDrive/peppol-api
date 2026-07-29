import { enterpriseProcedure } from '../../auth/enterprise';
import { lookupParticipant } from './lookup-participant';

export const participantsRouter = enterpriseProcedure
    .prefix('/participants')
    .tag('Participants')
    .router({
        lookup: lookupParticipant,
    });
