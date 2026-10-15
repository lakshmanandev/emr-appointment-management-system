# Implementation checklist

## Phase 1 — Inspect and define architecture

- [x] Preserved the existing README and Git checkout; continued in the current monorepo.
- [x] Kept service-oriented API modules, React pages, and documentation in their existing folders.

## Phase 2 — Workspaces and foundations

- [x] Installed workspace dependencies and generated the npm lockfile.
- [x] Environment template (`.env.example` contains placeholders only), ignore rules, Mongoose models/indexes, Express security middleware, request validation, centralized errors, logger, and health route.
- [x] Production Vite build passed after the management and appointment detail screens were added.
- [x] API startup checks for a replica set or `mongos` because appointment workflows require MongoDB transactions.
- [ ] Verify startup and transactions against a separately managed MongoDB deployment.

## Phase 3 — Authentication and authorization

- [x] Login, hashed passwords, access tokens, atomic refresh-token rotation, logout, configurable login rate limit, and role middleware.
- [x] Super-admin-only API routes and role-protected management page.
- [x] Integration coverage for invalid/successful login, refresh rotation/logout invalidation, admin staff provisioning, and doctor ownership.

## Phase 4 — Scheduling and appointments

- [x] Weekly schedule editor supports working days, multiple sessions, slot length, breaks, and timezone.
- [x] Booking, existing/new patient selection, slot reservation, cancellation, rescheduling, arrival, completion, consultation notes, and server-side search/filter/pagination.
- [x] Integration tests confirm simultaneous same-slot booking and same-destination reschedule each produce one winner and one 409; cancellation releases reservations; reschedule moves reservations.
- [x] Booking/rescheduling and schedule edits write a shared doctor schedule revision in transactions; a concurrency test confirms they cannot both commit an invalid slot.
- [x] Transactional reservation reconciliation deletes only rows without an appointment or tied to cancelled appointments; scheduled/arrived/completed reservations are preserved.
- [x] Reconciliation concurrency test confirms it preserves a booking while that booking commits.
- [x] Booking, cancellation, rescheduling, schedule updates, consultation edits and audit events use transactions; injected audit failures leave related state unchanged.
- [x] New-patient booking does not create a patient record when slot reservation fails; invalid calendar dates and daylight-saving gaps are rejected.
- [ ] Configure periodic scheduling and operational alerting for the reconciliation command; process-crash/database-outage chaos tests are not included.

## Phase 5 — React interface

- [x] Super-admin department, doctor and receptionist forms/rosters, and weekly schedule editor.
- [x] Appointment details, role-appropriate editing/actions, rescheduling, cancellation confirmation, and doctor notes.
- [x] Client route restrictions align with backend roles; backend authorization remains authoritative.
- [x] Appointment list provides patient, status, date, doctor, and department filters connected to server-side query parameters; doctor filter is hidden for doctor accounts.
- [x] Vitest/Testing Library coverage for authentication, booking submission, appointment list filters/loading, and API error states.

## Phase 6 — Tests and documentation

- [x] README, engineering decisions, API guide, OpenAPI spec, database schema, and this checklist updated.
- [x] Backend tests use `MongoMemoryReplSet` plus Supertest. Production must use a replica set or `mongos`; standalone MongoDB is rejected at API startup.
- [x] One active refresh session per user is documented; a later login replaces the earlier browser session.
- [x] OpenAPI YAML parses with unique mapping keys.
- [ ] Add responsive interaction tests across browser/device sizes.

## Phase 7 — Verification

- [x] `npm install` completed using process-local npm paths because the sandbox cannot access the default Windows profile.
- [x] Backend integration and unit tests passed: 26 tests (in-memory replica set; includes topology guard and refresh-session tests).
- [x] Frontend tests passed: 6 tests (Vitest/jsdom; API mocked).
- [x] Vite production build passed.
- [x] Confirmed no lint script is configured. Live MongoDB startup/deployment, production behavior, security review, and real-patient-data readiness are not verified.
