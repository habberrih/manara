# Minara SaaS Platform

Minara is a modular SaaS starter built with NestJS, Prisma, PostgreSQL, and an AdminJS-powered back office. It delivers authentication, organization management, tenant-aware data access, and admin tooling so you can ship a multi-tenant product quickly and safely.

## Table of Contents

- [Why Minara?](#why-minara)
- [Features](#features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Database & Seeding](#database--seeding)
- [Available Scripts](#available-scripts)
- [API Overview](#api-overview)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [License](#license)

## Why Minara?

The name “Minara” (منارة) means **lighthouse** in Arabic. The project aims to act as a guiding light for building production-grade SaaS backends: opinionated, secure, and ready to extend.

## Features

- **Authentication & Sessions**
  - Email/password signup & login with DTO validation.
  - JWT access and refresh tokens with rotation and hashed storage.
  - Guarded endpoints by default, with `@Public()` decorator for opt-out.
- **Organization Management**
  - CRUD APIs for organizations with slug management and soft delete.
  - Membership invitations, acceptance, role management, and removal.
  - Organization roles (`OWNER`, `ADMIN`, `MEMBER`) enforced via guard metadata.
- **Tenant Enforcement**
  - AsyncLocalStorage-based tenant context.
  - Prisma middleware that auto-injects `organizationId` filters and prevents cross-tenant writes.
  - Request-scoped guard ensures only accepted members access organization resources.
- **API Keys**
  - Organization-scoped keys with SHA-256 hashing and soft deletion.
  - One-time secret return at creation for safe storage by the client.
- **Tooling & Admin Experience**
  - Global validation pipes, URI versioning (`/api/v1`), and Swagger with bearer auth.
  - Seed data for demo users, organizations, memberships, and API keys.
  - Linting, formatting, and commit hooks (ESLint, Prettier, Husky, commitlint).
  - Upcoming AdminJS dashboard for super-admins to manage users, orgs, subscriptions, and API keys (see roadmap).

## Architecture & Tech Stack

- **Framework:** NestJS 11 with Feature Modules.
- **Language:** TypeScript (ES2023 target).
- **Database:** PostgreSQL using Prisma ORM.
- **Authentication:** `@nestjs/passport`, JWT strategies for access and refresh tokens.
- **Security & Utilities:** bcrypt, class-validator/-transformer, AsyncLocalStorage.
- **Docs & DX:** Swagger (`@nestjs/swagger`), lint-staged, Husky, commitlint, AdminJS (planned module) for an embedded admin front-end.

For deeper design notes, see `docs/core/project-sdr.md`.

## Getting Started

### Prerequisites

- Node.js 20+ (LTS recommended)
- npm 10+
- PostgreSQL (local or Docker)
- Optional: Redis (future modules), Stripe CLI (subscriptions roadmap)

### Install

```bash
npm install
```

### Configure the environment

Copy `.env.example` to `.env` and adjust values. At minimum set:

- `DATABASE_URL` (PostgreSQL connection string)
- `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`
- `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`

See [Environment Configuration](#environment-configuration) for details.

### Run the application

```bash
# development
npm run start

# development with watch
npm run start:dev

# production build + run
npm run build
npm run start:prod
```

The API listens on `http://localhost:3000/api/v1`. Swagger UI is available at `http://localhost:3000/docs`.

## Environment Configuration

`ConfigModule.forRoot` loads `.env` by default. Important groups:

- **App:** `PORT`, `NODE_ENV`, `APP_URL`
- **Database:** `DATABASE_URL` (Postgres)
- **Auth:** `JWT_SECRET_KEY`, `JWT_REFRESH_SECRET_KEY`, expirations
- **Stripe / Mail / Storage:** placeholders exist for future modules

The config module is ready for schema validation once Joi schemas are added (see TODOs in `src/app.module.ts`).

## Database & Seeding

### Prisma Migrations

```bash
npx prisma migrate dev --name <migration_name>
npx prisma generate
```

### Seed Data

```bash
npx prisma db seed
```

Seeds create:

- Users (email/password: `habberrih@manara.ly` / `password` etc.)
- Organizations (`Minara Demo Org`, `Acme Collaboration Hub`)
- Memberships with various roles including a pending invite
- API keys with hashed storage (plaintext secrets logged during seeding)

Use the seeded data for quick demos via Swagger or Postman.

## Available Scripts

| Script                | Description                                  |
| --------------------- | -------------------------------------------- |
| `npm run start`       | Start the server (default mode)              |
| `npm run start:dev`   | Start with file watching                     |
| `npm run start:debug` | Start with inspector                         |
| `npm run start:prod`  | Run compiled output (`dist/main.js`)         |
| `npm run build`       | Compile TypeScript to `dist/`                |
| `npm run lint`        | ESLint with auto-fix                         |
| `npm run format`      | Format source files with Prettier            |
| `npm run test`        | Jest unit tests                              |
| `npm run test:e2e`    | E2E tests (SuperTest, see `test/app.e2e.ts`) |
| `npm run prisma:seed:dev` | Run migrations and seed in one command   |

## API Overview

- **Auth Module (`/api/v1/auth`)**
  - `POST /signup` – create account
  - `POST /login` – obtain access/refresh tokens
  - `POST /logout` – revoke refresh token
  - `POST /refresh` – rotate access token (requires refresh token guard)
- **Users Module (`/api/v1/users`)**
  - `GET /me` – current profile
  - CRUD operations for user management (protected by JWT)
- **Organizations Module (`/api/v1/organizations`)**
  - Create/list/update/delete organizations
  - Membership operations: list, invite, accept, update role, remove
  - API key operations: list, create (with one-time secret), delete
  - Protected by `OrganizationMemberGuard` and tenant context interceptor

All controllers are versioned (`version: '1'`) and mounted under `/api`. Most routes require a bearer token; use `@Public()` for anonymous endpoints.

## Project Structure

```
src/
  app.module.ts
  auth/
  organization/
  user/
  common/           # decorators, guards, interceptors, middlewares, prisma utilities
  tenant/           # AsyncLocalStorage context + types
  prisma/           # Prisma service/module wrappers
prisma/
  schema.prisma
  migrations/
  seed.ts
docs/
  core/             # system design record, project structure
```

Services rely on Prisma via `PrismaService`, which composes soft-delete filtering, sensitive field redaction, and tenant scoping middleware.

## Roadmap

Tracked in `docs/tasks.md`. Upcoming milestones:

- Stripe subscriptions (webhooks, limits)
- AdminJS panel for super admins
- Notifications & background jobs (BullMQ + Redis)
- Observability (health checks, metrics, structured logging)
- Expanded automated tests

Contributions are welcome—feel free to open issues or PRs against those roadmap items.

## License

[MIT licensed](./LICENSE).

Built with ❤️ by Abdullah Habberrih
