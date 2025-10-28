# Implementation Tasks

This checklist outlines the implementation plan for the Minara SaaS platform, aligned with docs/project-sdr.md.

## 0) Foundations
- [X] Add dependencies: `prisma`, `@prisma/client`, `@nestjs/config`, `argon2`, `@nestjs/throttler`, `helmet`, `pino`, `pino-http`, `nestjs-pino`, `bullmq`, `ioredis`, `@adminjs/express`, `adminjs`, `stripe`.
- [X] Generate Prisma client (`npx prisma generate`) and create initial migration.
- [X] Add `PrismaModule` + `PrismaService` (with shutdown hooks) for DI.
- [X] Add `ConfigModule` with env validation schema and typed config.
- [ ] Bootstrap middlewares: Helmet, CORS, request ID, and pino logger.
- [ ] Set up rate limiting (Nest Throttler) on auth and write routes.

## 1) Auth Module
- [X] Local login/register with DTO validation and Argon2 hashing.
- [X] JWT access + refresh strategies and guards; refresh token rotation.
- [ ] Email verification and password reset flows (issue tokens, validate, expire).
- [X] Session/Token persistence if using server-side refresh tracking.

## 2) Organizations Module
- [x] Organization CRUD (create, update, list, soft delete).
- [x] Membership management (invite, accept, remove); roles: OWNER/ADMIN/MEMBER.
- [x] Org-scoped API keys (create, revoke) with hashed storage.
- [x] Tenant scoping guard/interceptor + Prisma middleware enforcing `organizationId`.

## 3) Subscriptions Module
- [ ] Stripe integration (products/plans sync, customer creation).
- [ ] Webhook handlers (checkout, subscription updated/canceled); idempotent store.
- [ ] Plan limit guard/interceptor applied to relevant endpoints.
- [ ] Graceful downgrade handling on subscription lapse.

## 4) Admin Module (AdminJS)
- [ ] Mount AdminJS at `/admin` behind SUPER_ADMIN guard.
- [ ] Register resources: User, Organization, Membership, Subscription, ApiKey.
- [ ] Add dashboard widgets: active orgs, users, MRR, recent events.
- [ ] Bulk actions: deactivate users, cancel subscriptions.

## 5) Notifications Module
- [ ] Mail transport abstraction (SMTP/Resend) and templates (verify, reset, invite, invoice).
- [ ] Queue emails via BullMQ; add retry/backoff.
- [ ] Store email events for troubleshooting (optional).

## 6) Background Jobs
- [ ] Configure BullMQ connection and named queues: `mail`, `billing`, `cleanup`.
- [ ] Implement processors with idempotency and telemetry.
- [ ] Scheduled jobs (renewals, weekly summaries, cleanup).

## 7) Observability & Health
- [ ] Add `/health` with DB, Redis, and provider checks.
- [ ] Expose Prometheus metrics (HTTP, DB, queues).
- [ ] Pino structured logging with correlation IDs; redact secrets.

## 8) API Docs
- [ ] Swagger at `/docs` with bearer auth and examples.
- [ ] Standard error shape and response DTOs.
- [ ] Route versioning at `/api/v1`.

## 9) Testing
- [ ] Unit tests for services and guards.
- [ ] E2E tests for auth, membership, and Stripe webhooks (mocked).
- [ ] Test DB setup using Prisma migrate and isolated schema.

## 10) Deployment
- [ ] Dockerfile and docker-compose (app, Postgres, Redis).
- [ ] Migrate on startup/release; DB backups and retention plan.
- [ ] Environment configs for staging/production; secrets via platform manager.

## 11) Security
- [ ] Input validation and sanitization at boundaries.
- [ ] Idempotency for webhooks and optional `Idempotency-Key` on writes.
- [ ] Audit logs for admin and sensitive operations.

## 12) Future Enhancements
- [ ] Webhook delivery subsystem (retries, signature, DLQ).
- [ ] Real-time notifications (WebSocket) for events.
- [ ] Analytics/usage per org.
- [ ] Optional Postgres RLS.
