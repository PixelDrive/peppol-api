import { z } from 'zod';
import { webhookEventTypes } from '../webhooks/events';

export const providerOutputSchema = z.literal('DOKAPI');
export const successOutputSchema = z.object({ success: z.literal(true) });

export const participantIdentifierOutputSchema = z.object({
    scheme: z.string(),
    value: z.string(),
    canonical: z.string(),
});

export const participantRegistrationStatusOutputSchema = z.enum([
    'UNKNOWN',
    'NOT_REGISTERED',
    'REGISTERING',
    'REGISTERED',
    'PARTIAL',
    'DEREGISTERING',
    'FAILED',
]);

export const enterpriseOutputSchema = z.object({
    id: z.uuid(),
    name: z.string(),
    companyNumber: z.string().nullable(),
    vatNumber: z.string().nullable(),
    provider: providerOutputSchema,
    useGlobalProviderCredentials: z.boolean(),
    active: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const enterpriseEndpointOutputSchema = z.object({
    id: z.uuid(),
    enterpriseId: z.uuid(),
    scheme: z.string(),
    value: z.string(),
    networkRegistrationStatus: participantRegistrationStatusOutputSchema,
    registrationProvider: providerOutputSchema.nullable(),
    providerRegistrationId: z.string().nullable(),
    registrationDetails: z.record(z.string(), z.unknown()).nullable(),
    registeredAt: z.date().nullable(),
    registrationAttemptedAt: z.date().nullable(),
    registrationError: z.string().nullable(),
    createdAt: z.date(),
    canonical: z.string(),
});

export const enterpriseEndpointStatusOutputSchema =
    enterpriseEndpointOutputSchema.omit({
        enterpriseId: true,
        registrationDetails: true,
    });

export const apiKeySummaryOutputSchema = z.object({
    id: z.uuid(),
    prefix: z.string(),
    active: z.boolean(),
    lastUsedAt: z.date().nullable(),
    expiresAt: z.date().nullable(),
    createdAt: z.date(),
});

export const documentTypeOutputSchema = z.enum(['INVOICE', 'CREDIT_NOTE']);
export const documentDirectionOutputSchema = z.enum(['OUTGOING', 'INCOMING']);
export const documentStatusOutputSchema = z.enum([
    'DRAFT',
    'VALIDATING',
    'INVALID',
    'PENDING',
    'SENT',
    'DELIVERED',
    'FAILED',
    'RECEIVED',
]);

export const parsedDocumentOutputSchema = z.object({
    type: documentTypeOutputSchema,
    senderEndpoint: z.string(),
    receiverEndpoint: z.string(),
    senderCountryCode: z.string(),
    documentId: z.string(),
});

export const documentSummaryOutputSchema = z.object({
    id: z.uuid(),
    type: documentTypeOutputSchema,
    direction: documentDirectionOutputSchema,
    status: documentStatusOutputSchema,
    senderEndpoint: z.string(),
    receiverEndpoint: z.string(),
    externalReference: z.string().nullable(),
    providerDocumentId: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.date(),
    updatedAt: z.date(),
});

export const documentOutputSchema = documentSummaryOutputSchema.extend({
    enterpriseId: z.uuid(),
    ublXml: z.string(),
});

export const validationMessageOutputSchema = z.object({
    id: z.string(),
    text: z.string(),
    location: z.string(),
});

export const webhookEndpointOutputSchema = z.object({
    id: z.uuid(),
    url: z.url(),
    events: z.array(z.enum(webhookEventTypes)),
    active: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date().optional(),
});

export const webhookDeliveryOutputSchema = z.object({
    id: z.uuid(),
    endpointId: z.uuid(),
    event: z.enum(webhookEventTypes),
    status: z.enum(['PENDING', 'DELIVERED', 'FAILED']),
    attempts: z.number().int(),
    responseStatus: z.number().int().nullable(),
    errorMessage: z.string().nullable(),
    nextAttemptAt: z.date(),
    deliveredAt: z.date().nullable(),
    createdAt: z.date(),
});

export const providerRegistrationStatusOutputSchema = z.object({
    registered: z.boolean(),
    providerRegistrationId: z.string().optional(),
    countryCode: z.string().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    providerDetails: z.record(z.string(), z.unknown()).optional(),
});

export const participantServiceOutputSchema = z.object({
    documentTypeIdentifier: z.string(),
    documentTypeScheme: z.string(),
    processIdentifier: z.string(),
    processScheme: z.string(),
});

export const participantLookupOutputSchema = z.object({
    participant: z.object({
        metaScheme: z.literal('iso6523-actorid-upis'),
        scheme: z.string(),
        value: z.string(),
        canonical: z.string(),
    }),
    registered: z.boolean(),
    sml: z.object({
        domain: z.string(),
        dnsName: z.string(),
    }),
    smp: z
        .object({
            baseUrl: z.url(),
            serviceCount: z.number().int().nonnegative(),
        })
        .nullable(),
    documentTypes: z.array(
        z.object({
            scheme: z.string(),
            value: z.string(),
        })
    ),
});

export const adminLoginOutputSchema = z.object({
    accessToken: z.string(),
    tokenType: z.literal('Bearer'),
    expiresAt: z.date(),
});

export const createEnterpriseOutputSchema = z.object({
    enterprise: enterpriseOutputSchema.extend({
        endpointId: z.string(),
        participantIdentifiers: z.array(participantIdentifierOutputSchema),
    }),
    apiKey: z.string(),
    warning: z.string(),
});

export const addParticipantIdentifierOutputSchema =
    enterpriseEndpointOutputSchema.extend({
        alreadyRegistered: z.boolean(),
    });

export const createApiKeyOutputSchema = z.object({
    id: z.uuid(),
    prefix: z.string(),
    expiresAt: z.date().nullable(),
    createdAt: z.date(),
    apiKey: z.string(),
    warning: z.string(),
});

export const getEnterpriseOutputSchema = enterpriseOutputSchema.extend({
    participantIdentifiers: z.array(enterpriseEndpointOutputSchema),
    endpoints: z.array(enterpriseEndpointOutputSchema),
    apiKeys: z.array(apiKeySummaryOutputSchema),
    configuredProviders: z.array(
        z.object({
            provider: providerOutputSchema,
            createdAt: z.date(),
            updatedAt: z.date(),
        })
    ),
});

export const listEnterprisesOutputSchema = z.object({
    enterprises: z.array(
        enterpriseOutputSchema.extend({
            endpointId: z.string().optional(),
            participantIdentifiers: z.array(enterpriseEndpointOutputSchema),
        })
    ),
});

export const listApiKeysOutputSchema = z.object({
    apiKeys: z.array(apiKeySummaryOutputSchema),
});

const participantRegistrationResultOutputSchema = z.object({
    registered: z.boolean(),
    alreadyRegistered: z.boolean(),
    partial: z.boolean(),
    businessCardPublished: z.boolean(),
    directoryPublished: z.boolean(),
    providerRegistrationId: z.string().optional(),
    providerDetails: z.record(z.string(), z.unknown()).optional(),
    errors: z.array(z.string()).optional(),
});

export const registerParticipantOutputSchema =
    participantRegistrationResultOutputSchema.extend({
        participantIdentifier: participantIdentifierOutputSchema,
        provider: providerOutputSchema,
        networkRegistrationStatus: z.enum(['REGISTERED', 'PARTIAL']),
    });

export const getParticipantRegistrationOutputSchema = z.object({
    participantIdentifier: participantIdentifierOutputSchema,
    provider: providerOutputSchema,
    networkRegistrationStatus: participantRegistrationStatusOutputSchema,
    providerStatus: providerRegistrationStatusOutputSchema,
});

export const deregisterParticipantOutputSchema = successOutputSchema.extend({
    participantIdentifier: participantIdentifierOutputSchema,
    provider: providerOutputSchema,
    networkRegistrationStatus: z.literal('NOT_REGISTERED'),
});

export const registerParticipantServiceOutputSchema =
    successOutputSchema.extend({
        participantIdentifier: participantIdentifierOutputSchema,
        provider: providerOutputSchema,
        service: participantServiceOutputSchema,
        providerDetails: z.record(z.string(), z.unknown()).optional(),
    });

export const deregisterParticipantServiceOutputSchema =
    successOutputSchema.extend({
        participantIdentifier: participantIdentifierOutputSchema,
        provider: providerOutputSchema,
        documentTypeIdentifier: z.string(),
        documentTypeScheme: z.string(),
    });

export const generateDocumentOutputSchema = parsedDocumentOutputSchema.extend({
    ublXml: z.string(),
});

export const listDocumentsOutputSchema = z.object({
    items: z.array(documentSummaryOutputSchema),
    nextCursor: z.string().optional(),
});

export const sendDocumentOutputSchema = parsedDocumentOutputSchema.extend({
    id: z.uuid(),
    status: z.enum(['PENDING', 'SENT']),
    provider: providerOutputSchema,
    providerDocumentId: z.string().optional(),
});

export const validateDocumentOutputSchema = z.object({
    valid: z.literal(true),
    errors: z.array(validationMessageOutputSchema),
    warnings: z.array(validationMessageOutputSchema),
    document: parsedDocumentOutputSchema,
});

export const getMeOutputSchema = enterpriseOutputSchema.extend({
    participantIdentifiers: z.array(enterpriseEndpointStatusOutputSchema),
    endpoints: z.array(enterpriseEndpointStatusOutputSchema),
});

export const createWebhookEndpointOutputSchema = webhookEndpointOutputSchema
    .omit({ updatedAt: true })
    .extend({
        secret: z.string(),
        warning: z.string(),
    });

export const listWebhookEndpointsOutputSchema = z.object({
    endpoints: z.array(
        webhookEndpointOutputSchema.required({ updatedAt: true })
    ),
});

export const listWebhookDeliveriesOutputSchema = z.object({
    deliveries: z.array(webhookDeliveryOutputSchema),
});
