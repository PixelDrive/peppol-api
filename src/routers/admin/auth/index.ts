import { base } from '../../../auth/base';
import { login } from './login';
import { logout } from './logout';

export const adminAuthRouter = base
    .prefix('/admin/auth')
    .tag('Admin authentication')
    .router({
        login,
        logout,
    });
