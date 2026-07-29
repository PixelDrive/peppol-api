import { adminAuthRouter } from './admin/auth';
import { adminEnterprisesRouter } from './admin/enterprises';
import { documentsRouter } from './documents';
import { enterpriseRouter } from './enterprise';
import { health } from './system/health';
import { participantsRouter } from './participants';
import { webhookEndpointsRouter } from './webhook-endpoints';

export const router = {
    health,
    adminAuth: adminAuthRouter,
    adminEnterprises: adminEnterprisesRouter,
    enterprise: enterpriseRouter,
    documents: documentsRouter,
    participants: participantsRouter,
    webhookEndpoints: webhookEndpointsRouter,
};

export type Router = typeof router;
