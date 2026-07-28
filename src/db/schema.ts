import {
    boolean,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core';

export const providerEnum = pgEnum('provider', ['DOKAPI']);
export const documentTypeEnum = pgEnum('document_type', [
    'INVOICE',
    'CREDIT_NOTE',
]);
export const documentDirectionEnum = pgEnum('document_direction', [
    'OUTGOING',
    'INCOMING',
]);
export const documentStatusEnum = pgEnum('document_status', [
    'DRAFT',
    'VALIDATING',
    'INVALID',
    'PENDING',
    'SENT',
    'DELIVERED',
    'FAILED',
    'RECEIVED',
]);
export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
    'PENDING',
    'DELIVERED',
    'FAILED',
]);

export const adminUsers = pgTable(
    'admin_users',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        email: text('email').notNull(),
        passwordHash: text('password_hash').notNull(),
        active: boolean('active').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [uniqueIndex('admin_users_email_unique').on(table.email)]
);

export const adminSessions = pgTable(
    'admin_sessions',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        adminUserId: uuid('admin_user_id')
            .notNull()
            .references(() => adminUsers.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull(),
        expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('admin_sessions_token_hash_unique').on(table.tokenHash),
        index('admin_sessions_admin_user_idx').on(table.adminUserId),
    ]
);

export const enterprises = pgTable(
    'enterprises',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        name: text('name').notNull(),
        companyNumber: text('company_number'),
        vatNumber: text('vat_number'),
        provider: providerEnum('provider').notNull(),
        useGlobalProviderCredentials: boolean('use_global_provider_credentials')
            .notNull()
            .default(true),
        active: boolean('active').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('enterprises_company_number_unique').on(
            table.companyNumber
        ),
        uniqueIndex('enterprises_vat_number_unique').on(table.vatNumber),
    ]
);

export const enterpriseEndpoints = pgTable(
    'enterprise_endpoints',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        enterpriseId: uuid('enterprise_id')
            .notNull()
            .references(() => enterprises.id, { onDelete: 'cascade' }),
        scheme: text('scheme').notNull(),
        value: text('value').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('enterprise_endpoints_identity_unique').on(
            table.enterpriseId,
            table.scheme,
            table.value
        ),
        index('enterprise_endpoints_enterprise_idx').on(table.enterpriseId),
    ]
);

export const enterpriseApiKeys = pgTable(
    'enterprise_api_keys',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        enterpriseId: uuid('enterprise_id')
            .notNull()
            .references(() => enterprises.id, { onDelete: 'cascade' }),
        prefix: text('prefix').notNull(),
        keyHash: text('key_hash').notNull(),
        active: boolean('active').notNull().default(true),
        lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
        expiresAt: timestamp('expires_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('enterprise_api_keys_prefix_unique').on(table.prefix),
        index('enterprise_api_keys_enterprise_idx').on(table.enterpriseId),
    ]
);

export const providerCredentials = pgTable(
    'provider_credentials',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        enterpriseId: uuid('enterprise_id')
            .notNull()
            .references(() => enterprises.id, { onDelete: 'cascade' }),
        provider: providerEnum('provider').notNull(),
        encryptedCredentials: text('encrypted_credentials').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('provider_credentials_enterprise_provider_unique').on(
            table.enterpriseId,
            table.provider
        ),
    ]
);

export const documents = pgTable(
    'documents',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        enterpriseId: uuid('enterprise_id')
            .notNull()
            .references(() => enterprises.id, { onDelete: 'cascade' }),
        type: documentTypeEnum('type').notNull(),
        direction: documentDirectionEnum('direction').notNull(),
        status: documentStatusEnum('status').notNull().default('DRAFT'),
        senderEndpoint: text('sender_endpoint').notNull(),
        receiverEndpoint: text('receiver_endpoint').notNull(),
        externalReference: text('external_reference'),
        providerDocumentId: text('provider_document_id'),
        ublXml: text('ubl_xml').notNull(),
        errorMessage: text('error_message'),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('documents_enterprise_created_idx').on(
            table.enterpriseId,
            table.createdAt
        ),
        index('documents_provider_document_idx').on(table.providerDocumentId),
    ]
);

export const webhookEndpoints = pgTable(
    'webhook_endpoints',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        enterpriseId: uuid('enterprise_id')
            .notNull()
            .references(() => enterprises.id, { onDelete: 'cascade' }),
        url: text('url').notNull(),
        encryptedSecret: text('encrypted_secret').notNull(),
        events: jsonb('events').$type<string[]>().notNull(),
        active: boolean('active').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('webhook_endpoints_enterprise_idx').on(table.enterpriseId),
    ]
);

export const webhookDeliveries = pgTable(
    'webhook_deliveries',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        webhookEndpointId: uuid('webhook_endpoint_id')
            .notNull()
            .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
        documentId: uuid('document_id').references(() => documents.id, {
            onDelete: 'set null',
        }),
        event: text('event').notNull(),
        payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
        status: webhookDeliveryStatusEnum('status')
            .notNull()
            .default('PENDING'),
        attempts: integer('attempts').notNull().default(0),
        responseStatus: integer('response_status'),
        errorMessage: text('error_message'),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        deliveredAt: timestamp('delivered_at', { withTimezone: true }),
        createdAt: timestamp('created_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('webhook_deliveries_pending_idx').on(
            table.status,
            table.nextAttemptAt
        ),
    ]
);

export const providerWebhookEvents = pgTable(
    'provider_webhook_events',
    {
        id: uuid('id').primaryKey().defaultRandom(),
        provider: providerEnum('provider').notNull(),
        providerEventId: text('provider_event_id').notNull(),
        payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
        processedAt: timestamp('processed_at', { withTimezone: true })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('provider_webhook_events_provider_id_unique').on(
            table.provider,
            table.providerEventId
        ),
    ]
);
