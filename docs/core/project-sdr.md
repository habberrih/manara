# Minara SaaS Platform — System Design Record (SDR)

## Overview

Minara is a multi-tenant SaaS backend built with NestJS, PostgreSQL, and Prisma. It provides modular APIs for authentication, organizations, subscriptions, and operational tooling.

This SDR defines scope, key requirements, design decisions, and operational considerations for the platform.

---

## Goals

- Multi-tenant architecture with strict org-level isolation.
- Subscription-based access with plan limits and roles.
- Clean, versioned REST API fully documented with Swagger.
- Internal ops console for super-admin operations and support tasks.
- Production readiness: logging, metrics, health checks, and safe defaults.

### Non-Goals

- No per-tenant database or schema split at MVP (row-scoped tenancy only).
- No real-time collaboration at MVP (WebSockets are a future enhancement).
- No marketplace of third-party integrations at MVP.

---

## Core Stack

| Layer           | Technology                        |
| --------------- | --------------------------------- |
| Framework       | NestJS (modular monolith)         |
| ORM             | Prisma                            |
| Database        | PostgreSQL                        |
| Authentication  | JWT + Refresh Tokens (Passport)   |
| Internal Ops Console | Custom NestJS module (planned)       |
| Background Jobs | BullMQ + Redis                    |
| Caching         | Redis                             |
| Email           | SMTP (Nodemailer/Resend)          |
| Storage         | S3-compatible (AWS/Cloudflare R2) |
| Deployment      | Docker + Vercel/Railway           |
| Docs            | Swagger (OpenAPI)                 |

---

## Tenancy & Data Isolation

- Tenancy model: row-level scoping via `organizationId` on all org-bound entities.
- Enforcement: service-level guards and Prisma middleware to automatically inject `organizationId` filters; avoid cross-org leaks.
- Optional: Postgres RLS can be introduced later; ensure schema is RLS-ready (explicit FKs, no cross-tenant constraints).
- API keys: optional organization-scoped keys for server-to-server usage with limited permissions.

---

## Authentication & Authorization

- Email/password signup & login with JWT access + refresh tokens.
- Email verification and password reset flows.
- Roles:
  - Global: `SUPER_ADMIN` (support + elevated tooling).
  - Org-level: `OWNER`, `ADMIN`, `MEMBER` via membership records.
- Guards & decorators: role-based guards, org membership checks, plan-limit interceptors.
- Password hashing: Argon2 (preferred) or bcrypt with strong parameters.

Entities: `User`, `Organization`, `Membership (UserOrganization)`, `Session/Token`, `ApiKey`.

---

## Subscriptions & Billing

- Provider: Stripe (or LemonSqueezy as alternative).
- Plans: `FREE`, `PRO (monthly/yearly)`, `ENTERPRISE`.
- Webhook-driven subscription lifecycle sync (idempotent handlers).
- Plan limits enforced at request time (guards/interceptors) and in jobs where relevant.
- Graceful downgrade on expiry; retain data with restricted write operations.

Entities: `SubscriptionPlan`, `Subscription`, `Invoice`, `PaymentEvent`.

---

## Organizations & Users

- Organization CRUD, invites, and member role management.
- Data scoping by `organizationId` across domain models.
- Soft delete and audit trails for sensitive changes.
- Organization settings: feature flags, limits, branding.

Entities: `Organization`, `Membership (UserOrganization)`, `OrganizationSetting`, `Invite`.

---

## API Design & Conventions

- Base path: `/api/v1/*` with Swagger at `/docs` (bearer auth).
- Content type: JSON; UTF-8; timestamps in ISO8601.
- Pagination: `?page=1&limit=20` with `X-Total-Count` header and `Link` rels.
- Filtering/sorting: `?search=`, `?sort=field:asc|desc` (whitelist fields).
- Error shape:
  ```json
  { "error": { "code": "string", "message": "human-readable", "details": {"field": ["issue"]} } }
  ```
- Rate limiting: Nest Throttler on auth and write routes; provider-aware for API keys.
- Idempotency: required for webhooks; optional `Idempotency-Key` for client writes.

---

## Internal Ops Console

- Planned management surface for super admins (route TBD).
- Manage Users, Organizations, Subscriptions, Invoices, Audit logs.
- Dashboard: total users, active orgs, MRR, recent events.
- Bulk actions: deactivate users, cancel subscriptions, resend invites.

---

## Background Jobs & Scheduling

- BullMQ queues: `mail`, `billing`, `cleanup`.
- Processors are idempotent; retries with exponential backoff.
- Scheduled tasks: renewals, summary emails, cleanup.
- Observability for queues: metrics, dead-letter strategy.

---

## Email & Notifications

- Transport: SMTP or Resend API.
- Templates: verify, reset, invoice, invite (MJML/Handlebars).
- Deliverability: domain auth (SPF/DKIM/DMARC), sandbox mode for dev.

---

## Observability & Health

- Logging: Pino (JSON) with request correlation IDs.
- Metrics: Prometheus endpoint; core app and queue metrics.
- Health checks: DB, Redis, queues, Stripe.

---

## Configuration & Secrets

- Environment-based config using Nest ConfigModule.
- Secrets via `.env` in dev; use platform secret manager in prod.
- Required envs grouped by concern (DB, Redis, JWT, Stripe, Mail, Storage).

---

## Database Schema (illustrative Prisma sketch)

```prisma
enum OrgRole { OWNER ADMIN MEMBER }
enum Plan { FREE PRO ENTERPRISE }

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  password     String
  name         String?
  isSuperAdmin Boolean  @default(false)
  memberships  Membership[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model Organization {
  id           String        @id @default(cuid())
  name         String
  slug         String        @unique
  plan         Plan          @default(FREE)
  memberships  Membership[]
  subscriptions Subscription[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model Membership {
  userId         String
  organizationId String
  role           OrgRole     @default(MEMBER)
  user           User         @relation(fields: [userId], references: [id])
  organization   Organization @relation(fields: [organizationId], references: [id])
  createdAt      DateTime     @default(now())
  @@id([userId, organizationId])
}

model Subscription {
  id                 String       @id @default(cuid())
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id])
  provider           String       // e.g. "stripe"
  providerCustomerId String
  providerSubId      String       @unique
  status             String
  plan               Plan
  currentPeriodEnd   DateTime
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
}

model ApiKey {
  id             String       @id @default(cuid())
  organizationId String
  keyHash        String       @unique
  name           String
  lastUsedAt     DateTime?
  createdAt      DateTime     @default(now())
  organization   Organization @relation(fields: [organizationId], references: [id])
}
```

---

## Environments & Deployment

| Environment     | Description                 |
| --------------- | --------------------------- |
| Development     | Local via Docker Compose    |
| Staging         | Railway or Render           |
| Production      | Vercel or AWS ECS           |
| Database        | Managed PostgreSQL          |
| Cache/Queue     | Upstash (Redis)             |

Deployment guidelines
- Immutable builds, image-based deploys.
- Run migrations on release; zero-downtime where possible.
- Backups and retention configured for DB.

---

## Security & Compliance

- Input validation with `class-validator`/`class-transformer`.
- HTTP security via Helmet, CORS configured per environment.
- Secrets never logged; PII masked.
- Audit logging for admin and sensitive operations.
- Data retention and deletion workflows for user/org removal.

---

## Testing Strategy

- Unit tests for services/guards.
- Integration tests for repositories and Prisma queries.
- E2E tests (SuperTest) for critical flows: auth, membership, billing webhooks.

---

## Development Workflow

- Conventional commits; PR checks run lints, tests, and type-checking.
- Code style via ESLint + Prettier; TypeScript strict mode.
- Migrations using `prisma migrate`; seeding via `prisma/seed.ts`.

---

## Future Enhancements

- GraphQL API gateway.
- API usage analytics per org.
- WebSocket event system.
- Webhook delivery subsystem with retries and signature verification.
- Multi-language email templates.
- Integration marketplace (Slack, Zapier).
