# Brownfield Enhancement PRD — S3-Compatible Facade on Irys

## Intro Project Analysis and Context

### Existing Project Overview
- **Analysis Source:** IDE-based fresh analysis grounded in `docs/brainstorming-session-results.md` (no prior `document-project` output).
- **Current Project State:** No S3-compatible facade exists in production. The team has Irys SDK expertise but no façade layer has been implemented. Key constraints to honor from the outset:
  - Irys immutability → versioning ON with delete markers; overwrites become new versions.
  - `ETag = "<sha256>"` (quoted lowercase SHA-256); MVP object size cap = 100 MB.
  - GET behavior: public buckets default to 302 redirect; private buckets proxy responses; `proxy.range=minimal` enables 206; otherwise return 416 for unsupported Range requests.
  - Auth (MVP): HMAC API keys with ≤5-minute replay window + nonce; SigV4 subset planned for phase 2.
  - No disruption to current/planned Irys usage; no pre-MVP data migration (migration CLI is opt-in for legacy S3 ingest).

### Available Documentation Analysis
- **Available Documentation Checklist:**
  - Tech Stack Documentation ☐
  - Source Tree / Architecture ☐
  - Coding Standards ☐
  - API Documentation ☐
  - External API Documentation ☐
  - UX / UI Guidelines ☐
  - Technical Debt Documentation ☐
  - Other: `docs/brainstorming-session-results.md` ☑
- **Notes:** Using the brainstorming session as the canonical input. Additional remediation tasks required:
  1. Generate OpenAPI (YAML skeleton) for the S3-compatible endpoints.
  2. Produce ERD & DDL for the mapping store (`buckets`, `objects`, `object_versions`, optional metadata tables).
  3. Build an Acceptance Test Matrix aligned with MVP scope (CRUD, LIST V2, Range, observability, auth, funding).

### Enhancement Scope Definition
- **Enhancement Types (confirmed):**
  - ☑ Integration with New Systems
  - ☑ Major Feature Modification
  - ☑ New Feature Addition
  - ☑ Performance / Scalability Improvements
  - ☑ Security Enhancements
  - ☐ UI / UX Overhaul
  - ☐ Technology Stack Upgrade
  - ☐ Bug Fix & Stability Improvements

We are defining the S3-compatible facade end-to-end—requirements, architecture, rollout—using the brainstorming document as the authoritative reference.

---


## Requirements

### Functional Requirements
FR1: Implement S3-compatible REST endpoints (`PUT/GET/HEAD/DELETE /{bucket}/{key}` and `GET /{bucket}?list`) that translate requests into Irys SDK uploads, lookups, and delete markers using the mapping store.
FR2: Persist bucket/key → version → `irys_receipt_id` mappings with atomic `latest_version_id` updates, version history, and delete markers so GET/LIST stay deterministic under concurrency.
FR3: Deliver LIST Objects V2 JSON responses with stable base64url continuation tokens (`key|version|uploaded_at`) and support prefix, max-keys, and commonPrefixes parameters.
FR4: Enforce HMAC API-key authentication with ≤5-minute replay window, nonce tracking, tenant scopes, and per-tenant rate limiting; expose `x-amz-request-id` on every response.
FR5: Provide proxy + Range support via the `proxy.range-minimal` flag (206 on success, 416 otherwise) while defaulting public buckets to 302 redirects and private buckets to proxying.
FR6: Ship the migration CLI (`plan/sync/verify/resume`) plus manifest format, `mapping.csv`, and verification sampling for optional legacy S3 ingestion.
FR7: Expose /healthz, /readyz, structured JSON logs, Prometheus metrics (HTTP, funding, SDK), and 1-minute synthetic probes with funding runway alerts and auto-fund hooks.
FR8: Return near-S3 error structures (JSON with `code`, `message`, `requestId`, `resource`) for 404/409/412/416/429/5xx scenarios, including throttling with `Retry-After`.

### Non-Functional Requirements
NFR1: Maintain ≥99.9% monthly availability; degrade safely (429/503 with Retry-After) under throttling or funding pressure.
NFR2: Meet latency targets—GET/HEAD redirect p95 <150 ms, proxied GET p95 <400 ms, PUT (≤100 MB) p95 <600 ms.
NFR3: Keep server error rate <0.5% per verb (client 4xx excluded) by enforcing idempotency, retries, and circuit breakers.
NFR4: Limit object payloads to 100 MB; larger uploads return 413 with guidance toward future multipart support.
NFR5: Ensure observability surfaces (metrics, logs, traces) are redacted, signed, and retained for 90-day hot / 12-month audit compliance.
NFR6: All secrets (API keys, service wallet) managed via Secrets Manager + KMS/HSM with rotation logging.
NFR7: Funding runway metrics must trigger warning (<7 days) and critical (<2 days) alerts with auto-fund attempts logged.
NFR8: System must remain deployable via canary/blue-green with feature flags (`proxy.range`, `proxy.enabled`, `auth.sigv4`) for controlled rollouts.

### Compatibility Requirements
CR1: Maintain bucket/key semantics and S3-style headers so legacy clients function without code changes (except endpoint/config tweaks).
CR2: Keep mapping-store schema additive; no changes to existing Irys data, and allow future migrations without breaking stored receipts.
CR3: Preserve existing operational workflows (no new human approvals for uploads) while adding observability via dashboards and alerts.
CR4: Ensure existing Irys SDK integrations continue to work; façade must not block direct SDK use or funding operations outside the service.

## Technical Constraints and Integration Requirements

### Existing Technology Stack
**Languages**: TypeScript (Node.js 20 LTS)
**Frameworks**: NestJS service architecture (HTTP module + dependency injection), Express-compatible middleware layer, TypeORM/Prisma for data access
**Database**: PostgreSQL 15 (primary mapping store) with advisory locking and JSONB for optional metadata
**Infrastructure**: Dockerised service ready for Kubernetes/ECS deployment; feature flag service (e.g., LaunchDarkly/ConfigCat) for `proxy.range`, `proxy.enabled`, `auth.sigv4`
**External Dependencies**: Irys SDK (upload/funding), Secrets Manager + KMS/HSM for credential storage, Prometheus + OpenTelemetry exporters, API Gateway / WAF for edge auth

### Integration Approach
**Database Integration Strategy**: Postgres schema with `buckets`, `objects`, `object_versions`, `idempotency_keys`; use transactions + row-level locking to update `latest_version_id`; expose migrations via Prisma/TypeORM
**API Integration Strategy**: REST controllers per S3 verb, HMAC auth guard, middleware for signature validation, error mapper to S3-compatible responses, optional API gateway routing for tenant throttling
**Frontend Integration Strategy**: No first-party UI; provide CORS defaults/global profile and allow per-bucket overrides in phase 2; enable presign stub responses for browser clients
**Testing Integration Strategy**: Jest + supertest for unit/integration, Postgres test container, contract tests for LIST V2 + Range, Irys devnet smoke tests in CI, load tests for LIST pagination & Range proxy

### Code Organization and Standards
**File Structure Approach**: NestJS domain modules (`auth`, `storage`, `listing`, `funding`, `observability`, `cli`) with shared libs for DTOs and validation
**Naming Conventions**: kebab-case file names, PascalCase classes, camelCase members; API routes mirror S3 verb structure
**Coding Standards**: ESLint (airbnb-typescript base) + Prettier; strict TypeScript (`"strict": true`); error types enumerated for consistent mapping
**Documentation Standards**: TSDoc on public services; OpenAPI YAML source of truth; CHANGELOG + ADRs for major architectural decisions

### Deployment and Operations
**Build Process Integration**: Multi-stage Docker build (lint → test → prod image) targeting Node.js 20; generate OpenAPI + Prisma schema artifacts during build
**Deployment Strategy**: Dev → staging → prod environments with canary/blue-green rollout; feature flags gate Range proxy, SigV4 subset, proxy disablement; GitHub Actions pipeline (future GA integration)
**Monitoring and Logging**: Structured JSON logs (x-amz-request-id, x-irys-receipt-id), Prometheus metrics scraped via /metrics, OpenTelemetry traces to collector, health/readiness endpoints with synthetic probes
**Configuration Management**: Environment variables injected via Secrets Manager; feature flags + config maps for per-tenant settings; database migrations automated via CI/CD gate

### Risk Assessment and Mitigation
**Technical Risks**: Range proxy gaps, LIST token churn, idempotency collisions, funding depletion; Mitigation: feature flags, load tests, row-locking + idempotency table, alerting + auto-fund throttles
**Integration Risks**: S3 client incompatibilities (headers, Range, auth), gateway outages, schema evolution; Mitigation: conformance tests with common SDKs, circuit breakers + 302 fallback, additive migrations
**Deployment Risks**: Canary regressions, config drift, secret rotation failures; Mitigation: canary metrics guard, IaC for config, rotation playbooks + audit logging
**Mitigation Strategies**: Documented runbooks (funding low, Range failure, schema rollback), chaos drills (gateway down, DB lag), acceptance matrix for CRUD/LIST/Range/auth/funding, automated alerting for runway + 5xx spikes

