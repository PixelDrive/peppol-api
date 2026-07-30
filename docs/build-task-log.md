# Build task log

- [x] Inspect Bookelio route separation, oRPC/Hono wiring, encryption, Dokapi
      adapter, KoSIT validation and Docker conventions.
      Files: reference repository only.
      Validation: relevant source and configuration files reviewed.
- [x] Create the TypeScript, pnpm, Hono, oRPC, Scalar, ESLint and Prettier
      foundation.
      Files: `package.json`, `tsconfig.json`, `vite.config.ts`,
      `eslint.config.js`, `.prettierrc`, `src/app.ts`.
      Validation: dependencies installed and OpenAPI transport type-checked.
- [x] Model administrators, enterprises, API keys, provider credentials,
      documents and webhooks with PostgreSQL/Drizzle.
      Files: `src/db/schema.ts`, `drizzle/`.
      Validation: initial SQL migration generated.
- [x] Implement admin sessions, enterprise API keys and AES-256-GCM credential
      encryption.
      Files: `src/auth/`, `src/lib/crypto.ts`, `src/lib/api-keys.ts`.
      Validation: encryption and API-key unit tests.
- [x] Enforce participant identifier ownership from the final XML.
      Files: `src/lib/peppol-endpoint.ts`, `src/peppol/authorization.ts`.
      Validation: EndpointID normalization unit tests.
- [x] Implement UBL generation/parsing, independent KoSIT validation and the
      provider interface with Dokapi.
      Files: `src/peppol/`, `src/providers/`, `src/routers/documents/`.
      Validation: TypeScript check.
- [x] Implement authenticated, idempotent Dokapi callbacks and signed,
      persistent client callbacks with retry/backoff.
      Files: `src/routes/provider-webhooks/`, `src/webhooks/`,
      `src/routers/webhook-endpoints/`.
      Validation: TypeScript check.
- [x] Add Docker image, local PostgreSQL compose stack, automatic migrations
      and environment documentation.
      Files: `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`.
      Validation: build scripts and configuration checks.
- [x] Run the final format, lint, type, unit-test and production-build suite.
      Files: all.
      Validation: Prettier, ESLint, TypeScript, 21 local tests, Vite build and
      generated OpenAPI (18 paths) pass. The network smoke test also passes
      when explicitly enabled.
- [x] Add the MIT license and expose it through package metadata and project
      documentation.
      Files: `LICENSE`, `package.json`, `README.md`.
      Validation: package metadata and license text reviewed.
- [x] Allow startup with empty provider environment variables while preserving
      runtime guards when the provider is used.
      Files: `src/config.ts`, `tests/config.test.ts`.
      Validation: configuration tests cover empty and configured Dokapi values.
- [x] Move client webhook delivery to a separate durable BullMQ worker backed
      by Redis and a PostgreSQL outbox reconciler.
      Files: `src/queues/`, `src/workers/`, `src/webhooks/delivery.ts`,
      `docker-compose.yml`, `vite.config.ts`.
      Validation: stable job IDs and retry settings are covered by tests;
      TypeScript, ESLint, Prettier, 17 tests and the dual-entry Vite production
      build pass.
- [x] Add provider-independent Peppol participant lookup through SML and SMP.
      Files: `src/peppol/discovery.ts`, `src/routers/participants/`,
      `tests/peppol-discovery.test.ts`.
      Validation: the official SHA-256/Base32 DNS example, U-NAPTR selection,
      SMP ServiceGroup parsing and absent-participant behavior are covered by
      tests. A separate network smoke test verifies `0208:0732788874` against
      the production SML/SMP without making the default test suite depend on
      Internet access.
- [x] Generalize enterprises to one primary and multiple additional Peppol
      participant identifiers, including Belgian `0208` enterprise-number and
      `9925` VAT identifiers.
      Files: `src/lib/peppol-endpoint.ts`, `src/db/schema.ts`,
      `src/routers/admin/enterprises/`, `src/routes/provider-webhooks/dokapi.ts`,
      `src/providers/dokapi.ts`.
      Validation: participant normalization, creation input, sender ownership
      and globally unambiguous inbound routing are covered by checks and tests;
      Dokapi now receives the sender country from the UBL instead of a Belgian
      constant.
- [x] Manage participant, business-card and document-service registration on
      the Peppol network through the provider abstraction.
      Files: `src/providers/`, `src/routers/admin/enterprises/`,
      `src/db/schema.ts`, `drizzle/0002_sloppy_nocturne.sql`.
      Validation: Dokapi request mapping, partial registration handling and
      registration input defaults are covered by unit tests; status is
      persisted and refreshable after interrupted operations.
