# Careflow — Enterprise EMR Appointment Management

A role-aware hospital appointment management application built with React/Vite, Express, MongoDB, and Mongoose. It provides authentication, schedule-based appointment booking, patient lookup, appointment workflows, audit records, and a responsive care team workspace.

## Implemented features

- Access JWTs and HTTP-only refresh cookie rotation; bcrypt password hashing and login rate limiting.
- Roles for super admins, receptionists, and doctors, with server-side appointment ownership checks.
- Doctor schedules with multiple sessions, slot durations, breaks, IANA time zones, and dynamic future slots.
- Existing patient search and new patient booking.
- Double-booking protection with a unique MongoDB `(doctor,startAt)` slot reservation index.
- Appointment listing, patient search, status/date/doctor/department filters in both UI and API, bounded pagination, status transitions, cancellation and audit events.
- Responsive dashboard, schedule booking UI, doctor list and appointment search.
- Dashboard status breakdown is rendered from the authenticated API's real same-day counts; the backend does not currently expose historical series, so the interface does not fabricate appointment trends or patient totals.
- Super-admin department, doctor and receptionist provisioning, plus weekly schedule editor.
- Appointment detail, editing, rescheduling, arrival, completion, cancellation and doctor consultation notes.
- Backend integration tests using an in-memory MongoDB and frontend tests using Vitest/Testing Library.
- API reference, OpenAPI definition, schema diagram and engineering decisions.

## Stack and architecture

Node.js ES modules, Express, Mongoose, Zod, bcryptjs, JWT, Pino HTTP, Helmet, CORS, React 18, Vite, React Router, Axios and plain responsive CSS. Business logic lives in server services; routes validate inputs and map requests to services. MongoDB owns persistence and the unique reservation constraint. See [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md).

## Requirements and setup

- Node.js 20 or newer
- MongoDB 6 or newer, configured as a replica set or accessed through `mongos` (multi-document transactions are required)

```sh
[ -f .env ] || cp .env.example .env
# Set unique random JWT_ACCESS_SECRET and JWT_REFRESH_SECRET values (32+ chars).
npm install
npm run seed
npm run dev
```

PowerShell: use `if (!(Test-Path .env)) { Copy-Item .env.example .env }` so an existing secrets file is preserved; use `npm.cmd` if script execution policy blocks `npm.ps1`.

Set `SEED_ADMIN_EMAIL` and a unique `SEED_ADMIN_PASSWORD` (12+ chars) before `npm run seed`. The seed command refuses to overwrite an existing account. After signing in, a super admin can provision departments, doctors, and receptionists using the `/api/v1/admin` endpoints. Never commit `.env`.

For synthetic local demo records, set a unique `DEMO_USER_PASSWORD` (12+ chars) in `.env` and run `npm run seed:demo` after creating the super admin. This idempotent script adds a `DEMO - General Medicine` department, demo doctor and receptionist accounts (`doctor.demo@example.test`, `reception.demo@example.test`), two clearly labeled synthetic patients, and future appointments. Both demo staff accounts use `DEMO_USER_PASSWORD`. It requires the same MongoDB replica set used by the application and never overwrites existing demo accounts or patient records. Do not run demo seeding in production or use real patient data.

## Environment variables

| Variable | Purpose |
|---|---|
| `NODE_ENV` | development, test, production |
| `PORT` | API port, default 4000 |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | Independent random signing secrets, 32+ characters |
| `ACCESS_TOKEN_TTL`, `REFRESH_TOKEN_DAYS` | Access and refresh expiry |
| `CLIENT_ORIGIN` | Exact allowed browser origin |
| `COOKIE_SECURE`, `COOKIE_SAME_SITE` | Refresh-cookie policy |
| `APP_TIMEZONE` | Default schedule timezone (`Asia/Kolkata`) |
| `LOGIN_RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_WINDOW_MS` | Login request limit and window (defaults: 10 per 15 minutes) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | One-time development seed inputs |
| `DEMO_USER_PASSWORD` | Password for the synthetic demo doctor and receptionist created by `npm run seed:demo` |

## Run and verify

`npm run dev` starts client and API. API listens on `http://localhost:4000`; Vite on `http://localhost:5173`. `GET /api/v1/health` is the API health check. `npm run build` builds the client. `npm test` runs backend integration/unit tests and frontend tests. There is no lint script configured yet. API details: [docs/API.md](docs/API.md); OpenAPI: [docs/openapi.yaml](docs/openapi.yaml). See [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md) for verified and remaining work.

### Tests and database requirements

Backend integration tests use `MongoMemoryReplSet`. The API refuses to start against standalone MongoDB because booking, rescheduling, cancellation, schedule changes, and their audit records rely on multi-document transactions. Configure `MONGODB_URI` with the replica set name, such as `mongodb://127.0.0.1:27017/emr_appointments?replicaSet=rs0`. The test package may need to download a MongoDB binary on first run.

## Database design

Users have one role; doctors reference users and departments; appointments reference patients, doctors, departments, and their creator. A slot reservation uniquely keys `(doctor,startAt)`. Reservation, appointment, schedule revision, and audit writes for core appointment workflows commit in one transaction. See [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

## Assumptions, limitations and deployment

Schedule dates and session times are interpreted in the doctor's IANA timezone and stored as UTC instants. Invalid calendar dates and local wall times skipped by daylight-saving transitions are rejected. A shared transactional schedule revision makes booking/rescheduling conflict with concurrent schedule edits; transaction retries revalidate against the committed schedule. Appointment status reserves a slot while scheduled, arrived, or completed; cancellation releases the unique reservation. Completed appointments retain their reservation. `npm run reconcile:reservations -w server` transactionally removes only reservations with no appointment or a cancelled appointment and preserves scheduled, arrived, and completed visits. Refresh rotation supports one active browser session per user: signing in again replaces the prior refresh token, so the previous browser must sign in again. Advanced account lifecycle controls remain out of scope.

For deployment use HTTPS, strong secrets from a secret manager, exact CORS origins, secure cookies, a managed MongoDB replica set with backups, centralized logs/metrics, and a reverse proxy. Add operational monitoring, retention controls, and a formal privacy/security review before real patient data is used.

The root `vercel.json` configures Vercel to build the client workspace and publish `client/dist` when the Vercel project root is the repository. If the Vercel project root is set to `client`, `client/vercel.json` supplies the SPA route rewrite. Both rewrite browser routes to `index.html`, so refreshing routes such as `/appointments` loads the React app. The frontend uses `VITE_API_URL` when set; otherwise it retains the configured Render API URL. Set `VITE_API_URL` in Vercel's project environment variables if the API moves, then redeploy so Vite embeds the new endpoint in the client build. The API must separately allow the deployed Vercel origin through `CLIENT_ORIGIN` and use secure cookies over HTTPS.
