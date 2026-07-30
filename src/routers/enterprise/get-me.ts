import { eq } from 'drizzle-orm';
import { enterpriseProcedure } from '../../auth/enterprise';
import { enterpriseEndpoints } from '../../db/schema';
import { getMeOutputSchema } from '../output-schemas';

export const getMe = enterpriseProcedure
    .route({
        method: 'GET',
        path: '/me',
        summary: 'Get authenticated enterprise',
    })
    .output(getMeOutputSchema)
    .handler(async ({ context: { db, enterprise } }) => {
        const endpoints = await db
            .select({
                id: enterpriseEndpoints.id,
                scheme: enterpriseEndpoints.scheme,
                value: enterpriseEndpoints.value,
                networkRegistrationStatus:
                    enterpriseEndpoints.networkRegistrationStatus,
                registrationProvider: enterpriseEndpoints.registrationProvider,
                providerRegistrationId:
                    enterpriseEndpoints.providerRegistrationId,
                registeredAt: enterpriseEndpoints.registeredAt,
                registrationAttemptedAt:
                    enterpriseEndpoints.registrationAttemptedAt,
                registrationError: enterpriseEndpoints.registrationError,
                createdAt: enterpriseEndpoints.createdAt,
            })
            .from(enterpriseEndpoints)
            .where(eq(enterpriseEndpoints.enterpriseId, enterprise.id));
        return {
            ...enterprise,
            participantIdentifiers: endpoints.map((endpoint) => ({
                ...endpoint,
                canonical: `${endpoint.scheme}:${endpoint.value}`,
            })),
            endpoints: endpoints.map((endpoint) => ({
                ...endpoint,
                canonical: `${endpoint.scheme}:${endpoint.value}`,
            })),
        };
    });
