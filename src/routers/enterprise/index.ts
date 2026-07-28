import { enterpriseProcedure } from '../../auth/enterprise';
import { getMe } from './get-me';

export const enterpriseRouter = enterpriseProcedure
    .prefix('/enterprise')
    .tag('Enterprise')
    .router({ me: getMe });
