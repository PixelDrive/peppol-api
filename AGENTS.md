# Project guide

## Stack and entrypoints

- Package manager: pnpm 9.
- Runtime: Node.js 20+ with Hono and oRPC.
- Database: PostgreSQL with Drizzle ORM. Schema is in `src/db/schema.ts`;
  checked-in migrations are in `drizzle/`.
- Redis + BullMQ provide durable background processing.
- `src/index.ts` runs migrations, bootstraps the optional administrator and
  serves the Hono app on port 3001.
- `src/workers/index.ts` is a separate process that consumes client webhook
  deliveries and reconciles the PostgreSQL outbox with Redis.
- `/api/*` is the OpenAPI transport, `/rpc/*` is the native oRPC transport,
  `/openapi.json` is the specification and `/` is Scalar.

## Architecture

- Follow the Bookelio convention: one router per domain, one file per endpoint,
  and thin `index.ts` composition files.
- Hono-only provider callback routes live under
  `src/routes/provider-webhooks/`; API contracts live under `src/routers/`.
- Provider-independent behavior lives under `src/peppol/`. Provider adapters
  implement `PeppolProvider` under `src/providers/`.
- Peppol participant discovery lives in `src/peppol/discovery.ts` and must use
  the current SHA-256/Base32 SML U-NAPTR flow, independently from providers.
- Queue producers live under `src/queues/`; workers must stay under
  `src/workers/` and must never be started by the HTTP entrypoint.
- Add a provider by implementing the interface, extending the database enum and
  factory, then adding an authenticated callback adapter if required.
- Exported business helpers and non-obvious security logic need concise JSDoc.

## Tenant and security invariants

- Never query a tenant-owned resource by ID alone. Include the authenticated
  `enterpriseId` in the predicate.
- Enterprise API key secrets and administrator passwords are scrypt hashes.
- Provider credentials and client webhook secrets are AES-256-GCM encrypted.
- Never log or return decrypted credentials.
- Participant identifiers are generic and globally unique across enterprises.
  An enterprise may own several identifiers. Belgian enterprise-number
  identifiers use `0208:<10-digit BCE/KBO number>` and Belgian VAT identifiers
  use `9925:BE<10-digit VAT number>`.
- Local participant ownership and provider network registration are separate
  states. Network changes must go through `PeppolProvider`, persist their state
  on the participant identifier and remain recoverable through a provider
  status refresh after an interrupted request.
- Do not delete a local participant identifier until its network registration
  is confirmed absent. Document/process capabilities are registered separately
  from the participant service group and business card.
- Parse the supplier EndpointID from the final UBL XML and call
  `assertSenderBelongsToEnterprise` before validation or provider submission.
- Participant lookup failures must distinguish an absent DNS record from SML
  or SMP infrastructure failures; never report an outage as "not registered".
- KoSIT validation is independent of providers and is enabled before sending by
  default.
- Provider callbacks must be authenticated and idempotent. Client callbacks
  must be persisted, HMAC-signed and retryable through BullMQ.
- PostgreSQL is the webhook outbox source of truth. Always persist a delivery
  before enqueueing it and retain reconciliation for failed Redis publication.

## Commands

- `pnpm dev`
- `pnpm dev:worker`
- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm db:generate`
- `docker compose up --build`

Update `docs/build-task-log.md` when implementation work changes runtime
behavior or architecture.
