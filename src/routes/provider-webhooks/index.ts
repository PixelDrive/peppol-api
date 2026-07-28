import { Hono } from 'hono';
import { dokapiWebhookRouter } from './dokapi';

export const providerWebhooksRouter = new Hono();

providerWebhooksRouter.route('/dokapi', dokapiWebhookRouter);
