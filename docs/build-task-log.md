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
- [x] Enforce Belgian `0208:<BCE>` EndpointID ownership from the final XML.
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
      Validation: Prettier, ESLint, TypeScript, 13 unit tests, Vite build,
      generated OpenAPI (17 paths) and Docker image build all pass.
- [x] Add the MIT license and expose it through package metadata and project
      documentation.
      Files: `LICENSE`, `package.json`, `README.md`.
      Validation: package metadata and license text reviewed.
