# Project guide

## Stack and entrypoints

- Package manager: pnpm 9.
- Runtime: Node.js 20+ with Hono and oRPC.
- Database: PostgreSQL with Drizzle ORM. Schema is in `src/db/schema.ts`;
  checked-in migrations are in `drizzle/`.
- `src/index.ts` runs migrations, bootstraps the optional administrator, starts
  the webhook retry worker and serves the Hono app on port 3001.
- `/api/*` is the OpenAPI transport, `/rpc/*` is the native oRPC transport,
  `/openapi.json` is the specification and `/` is Scalar.

## Architecture

- Follow the Bookelio convention: one router per domain, one file per endpoint,
  and thin `index.ts` composition files.
- Hono-only provider callback routes live under
  `src/routes/provider-webhooks/`; API contracts live under `src/routers/`.
- Provider-independent behavior lives under `src/peppol/`. Provider adapters
  implement `PeppolProvider` under `src/providers/`.
- Add a provider by implementing the interface, extending the database enum and
  factory, then adding an authenticated callback adapter if required.
- Exported business helpers and non-obvious security logic need concise JSDoc.

## Tenant and security invariants

- Never query a tenant-owned resource by ID alone. Include the authenticated
  `enterpriseId` in the predicate.
- Enterprise API key secrets and administrator passwords are scrypt hashes.
- Provider credentials and client webhook secrets are AES-256-GCM encrypted.
- Never log or return decrypted credentials.
- Belgian EndpointID is always `0208:<10-digit BCE/KBO number>`. A Belgian VAT
  number may be accepted as input only to derive the BCE number.
- Parse the supplier EndpointID from the final UBL XML and call
  `assertSenderBelongsToEnterprise` before validation or provider submission.
- KoSIT validation is independent of providers and is enabled before sending by
  default.
- Provider callbacks must be authenticated and idempotent. Client callbacks
  must be persisted, HMAC-signed and retryable.

## Commands

- `pnpm dev`
- `pnpm check-types`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm db:generate`
- `docker compose up --build`

Update `docs/build-task-log.md` when implementation work changes runtime
behavior or architecture.
