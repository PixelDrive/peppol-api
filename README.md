# Peppol Hono API

A multi-tenant TypeScript API built with Hono and oRPC. It provides an
abstraction over Peppol access points, with Dokapi as the first adapter, while
keeping UBL validation independent from providers. Webhook deliveries are
processed by a separate BullMQ worker backed by Redis as a durable queue.

## Security principles

- An administrator account creates and configures enterprises.
- Each enterprise uses its own API keys. Only the prefix and a scrypt hash are
  stored; the complete key is displayed only when it is created.
- Enterprise-specific Dokapi credentials are encrypted with AES-256-GCM in
  PostgreSQL. An enterprise may alternatively use global Dokapi credentials
  supplied through environment variables.
- Each enterprise has a primary Peppol participant identifier and may register
  several additional identifiers. Identifiers are globally unique within the
  application so that every incoming document maps to exactly one tenant and
  its webhooks.
- Participant identifiers are international and use the
  `<ISO 6523 scheme>:<value>` format. In Belgium, the BCE/KBO enterprise number
  uses `0208:0732788875`, while a VAT number may use `9925:BE0732788875`.
- Before every validation or submission, the API parses the final XML and
  compares the supplier participant identifier against every identifier
  registered to the authenticated enterprise. An enterprise may send with any
  of its registered identifiers, but never on behalf of another enterprise.
- The C1 country passed to the provider comes from the supplier address in the
  final XML; it is not forced to `BE`.
- Validation is performed through a KoSIT-compatible service independently of
  the provider.

## Local setup

```bash
cp .env.example .env
openssl rand -hex 32
# Set the generated value as ENCRYPTION_SECRET and change the admin secrets.
docker compose up --build
```

The API is available at `http://localhost:3001`:

- Scalar: `/`
- OpenAPI: `/openapi.json`
- REST/OpenAPI transport: `/api/*`
- Native oRPC transport: `/rpc/*`
- Dokapi webhook: `/webhooks/providers/dokapi/events`

Drizzle migrations are applied at startup when `RUN_MIGRATIONS=true`.

Dokapi environment variables may remain empty: no provider is required for the
application to start. An enterprise configured to use global credentials
receives a `PRECONDITION_FAILED` error when attempting to send until
`DOKAPI_CLIENT_ID` and `DOKAPI_CLIENT_SECRET` are configured.

To develop outside Docker:

```bash
pnpm install
docker compose up -d postgres redis
pnpm db:migrate
pnpm dev
# In a second terminal
pnpm dev:worker
```

## Administration flow

At startup, `ADMIN_EMAIL` and `ADMIN_PASSWORD` create the administrator account
if it does not already exist. Changing the password in the environment updates
it on the next restart.

1. `POST /api/admin/auth/login` returns an opaque bearer token.
2. `POST /api/admin/enterprises` creates an enterprise with its primary and
   additional participant identifiers, then returns its first API key once.
   For backward compatibility, omitting `participantId` and providing a Belgian
   BCE/KBO or VAT number derives a `0208` identifier.
3. `PUT /api/admin/enterprises/{enterpriseId}/provider` switches between global
   Dokapi credentials and encrypted enterprise-specific credentials.
4. `GET /api/admin/enterprises/{enterpriseId}/api-keys` lists key metadata
   without exposing secrets or hashes. `POST` creates a key and
   `DELETE /api/admin/enterprises/{enterpriseId}/api-keys/{apiKeyId}` revokes
   one.
5. `POST /api/admin/enterprises/{enterpriseId}/participant-identifiers` adds an
   identifier.
   `DELETE /api/admin/enterprises/{enterpriseId}/participant-identifiers/{participantIdentifierId}`
   removes it; the last identifier cannot be removed.

Creation example:

```json
{
    "name": "Example SRL",
    "participantId": "0208:0732788874",
    "additionalParticipantIds": ["9925:BE0732788874"],
    "companyNumber": "0732788874",
    "vatNumber": "BE0732788874",
    "provider": "DOKAPI",
    "useGlobalProviderCredentials": true
}
```

This example accepts documents addressed to both `0208:0732788874` and
`9925:BE0732788874` and sends notifications to the same webhooks. Outgoing
documents may also use either identifier as the supplier identifier.

Adding a local identifier does not automatically publish it on the Peppol
network. Network registration is an explicit administrator operation.

## Peppol network registration

Administrators can publish each locally owned participant through the
enterprise's configured provider. Provider credentials remain optional at
startup; these operations return `PRECONDITION_FAILED` at runtime when the
selected enterprise has no usable provider credentials.

Register or update the participant and its business card:

```http
POST /api/admin/enterprises/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-registration
```

```json
{
    "countryCode": "BE",
    "businessCard": {
        "name": "Example SRL",
        "language": "en",
        "websiteUrls": ["https://example.com"],
        "contacts": [
            {
                "type": "billing",
                "name": "Billing team",
                "email": "billing@example.com"
            }
        ]
    },
    "publishToDirectory": true
}
```

The operation creates the participant and complete business card through
Dokapi. When the participant already belongs to the same Dokapi client, the
business card is updated instead. `publishToDirectory` also asks Dokapi to push
the card to the Peppol Directory. Dokapi may return partial success when the SMP
participant was created but its business card failed; this is persisted as
`PARTIAL` rather than incorrectly reporting the participant as absent.

Register a document type and process that the participant can receive:

```http
POST /api/admin/enterprises/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-services
```

```json
{
    "documentTypeIdentifier": "urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1",
    "processIdentifier": "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"
}
```

The default schemes are `busdox-docid-qns` for document types and
`cenbii-procid-ubl` for processes. They can be overridden with
`documentTypeScheme` and `processScheme`.

Other lifecycle operations:

- `GET /api/admin/enterprises/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-registration`
  refreshes registration status from the provider.
- `DELETE /api/admin/enterprises/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-services`
  removes a document type registration.
- `DELETE /api/admin/enterprises/{enterpriseId}/participant-identifiers/{participantIdentifierId}/network-registration`
  removes the participant from the provider while retaining its local
  identifier.

The local states are `UNKNOWN`, `NOT_REGISTERED`, `REGISTERING`, `REGISTERED`,
`PARTIAL`, `DEREGISTERING` and `FAILED`. Identifiers start as `UNKNOWN` until
their state is checked against the provider. A local identifier cannot be
deleted until its provider registration has been confirmed absent or removed.
After registration, SML/SMP and Peppol Directory propagation may take time;
Dokapi notes that public lookup can take up to one hour.

## Enterprise API

Pass the enterprise key in the `x-api-key` header.

- `GET /api/enterprise/me`
- `POST /api/documents/generate`: converts structured data to UBL with
  `@pixeldrive/peppol-toolkit`.
- `POST /api/documents/validate`: verifies the participant identifier and
  validates the document with KoSIT.
- `POST /api/documents/send`: accepts either `{"ublXml":"..."}` or a structured
  `{"type":"INVOICE","document":{...}}` payload, then authorizes, validates,
  persists and sends the resulting UBL document through the configured adapter.
  Optional `externalReference` and `validate` fields are supported by both
  request shapes.
- `GET /api/documents` and `GET /api/documents/{documentId}`: document tracking
  strictly scoped to the authenticated tenant.
- `GET /api/participants/lookup?participantId=0208%3A0732788875`: checks a
  participant directly on the Peppol network and returns the document types
  advertised by its SMP.
- `/api/webhook-endpoints`: client webhook configuration and delivery history.

Incoming documents reported by Dokapi are downloaded, checked against the
registered receiver identifier, validated with KoSIT, persisted and then
reported to the enterprise that owns the identifier. All identifiers belonging
to the same enterprise therefore share the same webhook configuration.

## Peppol participant lookup

Participant lookup is independent of configured providers. It implements the
current official SML/SMP discovery mechanism:

1. Normalize the international participant identifier. Belgian BCE/KBO and VAT
   shorthand values remain accepted as a convenience and map to `0208:<BCE>`,
   while an explicit Belgian VAT identifier uses `9925:BE<VAT>`.
2. Calculate the DNS name with SHA-256 and Base32.
3. Resolve the `Meta:SMP` U-NAPTR record.
4. Retrieve the `ServiceGroup` over HTTPS from the discovered SMP.
5. Extract the advertised document types.

The endpoint requires an enterprise API key. A missing DNS record returns
`registered: false`. A DNS outage, malformed record or invalid SMP response
returns a gateway error so that a network failure is not mistaken for an
unregistered participant.

`PEPPOL_SML_DOMAIN` selects another SML environment, and
`PEPPOL_LOOKUP_TIMEOUT_MS` limits the external request duration. The default
production domain is `edelivery.tech.ec.europa.eu`.

A smoke test checks enterprise `0732788874` directly on the production network.
It is kept separate from the unit test suite so local and CI tests do not depend
on Internet access:

```bash
pnpm test:network
```

## Client webhooks

Each endpoint selects its events:

`document.pending`, `document.sent`, `document.delivered`, `document.failed`,
`document.received`, `document.invalid`.

The signature is calculated as follows:

```text
hex(HMAC_SHA256(webhook_secret, "<timestamp>.<raw_json_body>"))
```

Sent headers:

- `x-peppol-delivery`: stable delivery identifier used for deduplication
- `x-peppol-event`
- `x-peppol-timestamp`
- `x-peppol-signature: v1=<signature>`

Failures are persisted and retried with exponential backoff. Consumers must
deduplicate deliveries using `x-peppol-delivery`.

Each delivery is first recorded in the PostgreSQL outbox and then published to
Redis using its UUID as the BullMQ `jobId`. The `webhook-worker` service
therefore continues deliveries and retries while the HTTP process is restarting
or unavailable. A worker-side scanner periodically republishes `PENDING` rows
that may not have reached Redis after a crash between the SQL write and queue
publication.

Redis uses AOF and a persistent volume in Docker Compose. In production, the API
and `node dist/worker.mjs` must be deployed as two independent processes sharing
the same database and `REDIS_URL`.

Generate and enable the Dokapi HMAC secret with
`POST /webhooks/secretKey`, then store the returned value in
`DOKAPI_WEBHOOK_SECRET`. Incoming Dokapi webhooks must include the hexadecimal
HMAC-SHA256 digest in `x-dokapi-signature`. The digest is verified in constant
time against the exact raw request body before JSON parsing; the secret and
signature are never logged.

## Adding a provider

1. Implement `PeppolProvider` under `src/providers/`.
2. Add credential resolution to `src/providers/factory.ts`.
3. Add the provider to the Drizzle enum and generate a migration.
4. Implement its authenticated, idempotent Hono webhook under
   `src/routes/provider-webhooks/`.

XML generation, tenant authorization, KoSIT validation, persistence and client
webhooks remain shared and must not be reimplemented in the adapter.

## License

This project is distributed under the [MIT License](./LICENSE).
