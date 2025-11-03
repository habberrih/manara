# Project Structure

This document describes the recommended repository layout and module responsibilities for the Minara SaaS platform.

## Layout

```text
.
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ common/                  # Cross-cutting: guards, interceptors, filters, pipes, utils
│  ├─ config/                  # Config modules, validation schema, env typing
│  ├─ modules/
│  │  ├─ auth/                 # AuthN/AuthZ, JWT, refresh, email verification
│  │  ├─ users/                # Profiles, account management
│  │  ├─ organizations/        # Org CRUD, invites, membership
│  │  ├─ subscriptions/        # Plans, webhooks, plan limits
│  │  ├─ ops-console/          # Internal operations tooling (planned)
│  │  ├─ projects/             # Sample org-scoped CRUD (reference module)
│  │  ├─ notifications/        # Email templates, mail service abstraction
│  │  ├─ audit/                # Audit log writer + query endpoints
│  │  └─ health/               # Liveness/readiness checks
│  ├─ jobs/                    # BullMQ queues, processors, schedulers
│  ├─ infra/                   # External adapters: storage, email provider, stripe client
│  └─ swagger/                 # Swagger config, decorators (if separated)
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ test/
│  ├─ unit/                    # Fast unit tests
│  └─ e2e/                     # SuperTest-based E2E tests
├─ docs/                       # Project docs (SDR, structure, ADRs)
├─ scripts/                    # One-off tooling (db reset, local setup)
├─ docker/                     # Dockerfiles, compose, env examples
├─ .env.example                # Documented envs (non-secret)
├─ eslint.config.mjs           # ESLint config
├─ .prettierrc                 # Prettier config
├─ tsconfig.json               # TypeScript config
└─ README.md
```

## Module Guidelines

- One module per domain; keep controllers thin and services cohesive.
- DTOs with `class-validator` and `class-transformer` for every input boundary.
- Repository pattern optional; Prisma can be used directly in services when simple.
- Use `common/guards` for role and org membership checks; keep authorization centralized.
- Keep external provider clients in `infra/` and inject via module providers.

## API Conventions

- Base path: `/api/v1`.
- Consistent pagination (`page`, `limit`), sorting (`sort=field:asc|desc`), and filtering.
- Error format: `{ error: { code, message, details } }`.
- Include `request-id` (correlation ID) header in responses when present.

## Background Jobs

- Define queues in `jobs/queues.ts`; processors in `jobs/processors/*`.
- Use idempotent processors; retries with exponential backoff.
- Schedule recurring tasks via a scheduler module (e.g., BullMQ `repeat` options).

## Configuration

- Centralize environment parsing in `config/` with a validation schema.
- Split config by concern: `app`, `db`, `redis`, `jwt`, `stripe`, `mail`, `storage`.

## Security

- Apply Helmet and CORS in bootstrap; restrict CORS by environment.
- Use Nest Throttler for rate limiting on auth and write-heavy routes.
- Avoid logging secrets; redact tokens and PII where possible.

## Testing

- Unit tests for services, guards, and shared utilities.
- E2E tests for critical user flows and billing webhooks.
- Prefer in-memory or isolated test DB with Prisma migrate in test setup.

## Migrations & Seeding

- Use `prisma migrate` for schema changes.
- Place initial data in `prisma/seed.ts`; keep idempotent and environment-aware.

## Naming & Structure Conventions

- Use kebab-case for file names, PascalCase for classes, camelCase for fields.
- Keep public controller DTOs and response shapes versioned under `modules/*/dto`.
- Co-locate module tests under `test/` mirroring `src/modules/*` paths.

For broader design details, see `docs/project-sdr.md`.
