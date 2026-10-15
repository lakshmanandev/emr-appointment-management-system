# Engineering decisions

## Layering

Express routes validate and authorize; service modules own scheduling, appointment transitions, reservation acquisition, and authentication. Mongoose models declare relationships and indexes. React is split into pages, route protection, authentication context, and a shared Axios client. MongoDB owns persistence and the unique reservation constraint.

## Relationships and indexes

Identity is stored in `User`; a `Doctor` is an optional professional profile linked one-to-one to a user. Departments and patients are separate collections, and appointments reference both rather than copying names. Weekly schedule configuration is embedded on the doctor. `Doctor.scheduleRevision` is updated by both booking/rescheduling and schedule changes inside the transaction to force a write conflict when those operations race. `DoctorSchedule` and `Session` model files are future extension points and are not written by current routes.

Unique indexes enforce user email, patient ID, doctor code, department name, audit operation ID, and `(doctor,startAt)` reservations. Compound appointment indexes support doctor/day/status, department/status/day and patient history. Mobile and patient-name indexes support front desk search.

## Transactions, concurrency, and recovery

Booking writes the reservation, a new patient when needed, the appointment, and its audit event in one transaction. Rescheduling acquires the destination reservation, updates the appointment, releases the old reservation, and writes its audit event in one transaction. Cancellation updates status, releases the reservation, and writes its audit event atomically. Arrival, completion, consultation edits, schedule updates, and super-admin department/staff provisioning also pair their state changes with audit events transactionally. Audit storage failure aborts the related change.

Booking/rescheduling and schedule edits both increment `Doctor.scheduleRevision` in their transaction. MongoDB detects conflicting writes to that shared document and retries the transaction; the retried operation validates the current schedule and reservation state. A schedule proposal is also rejected if it would invalidate an upcoming reserved slot. This coordination is enforced across application instances by MongoDB, not an in-process lock.

The API requires MongoDB 6+ on a replica set or behind `mongos`. Startup checks the `hello` response and fails closed on standalone MongoDB. Tests use a one-member in-memory replica set. Transactions use snapshot read concern and majority write concern. Standalone deployments are unsupported for the API's appointment workflows.

`npm run reconcile:reservations -w server` is the safe reservation repair command. It streams reservation rows and checks each inside a transaction. It removes a row only when its appointment is missing or cancelled, and preserves scheduled, arrived, and completed appointments. A new booking or cancellation transaction has uncommitted writes invisible to the candidate scan, so reconciliation cannot remove a reservation that may belong to an active transaction. Each deletion has a matching audit event in the same transaction. Drain older API instances that used non-transactional writes before the first reconciliation run after upgrade. Schedule the command periodically if operationally appropriate.

## Status rules

Scheduled and arrived appointments reserve their slot; completed appointments retain the reservation as a historical invariant; cancelled appointments release it. Allowed transitions are scheduledÃ¢â€ â€™arrived, arrivedÃ¢â€ â€™completed, and scheduled/arrivedÃ¢â€ â€™cancelled. Cancelled/completed records cannot be reopened through the API.

## Security

Passwords use bcrypt cost 12; access tokens expire quickly; refresh cookies are HTTP-only and stored only as SHA-256 digests. Refresh rotation uses a conditional database update so one refresh token can only win once. There is one refresh-token hash per user: a new login replaces the previous browser session. Multi-device sessions are not implemented. JWT algorithm is pinned. Zod validates request bodies and query inputs. Helmet, exact-origin CORS, payload limits and login rate limiting are enabled. Doctors are restricted by their profile reference on appointment list/detail/update paths; frontend route guards do not replace backend authorization. Logs redact cookie, authorization and password fields. Secrets are environment-provided.

## Time and performance

Schedule wall clocks are converted using `Intl.DateTimeFormat` with the doctor's IANA timezone and appointment instants are stored in UTC. Invalid calendar dates and local times skipped by daylight-saving transitions are rejected. Slot generation enumerates configured sessions and performs one reservation lookup for generated starts. Appointment results use selected projections, bounded pagination and server-side filters. Patient query expansion is capped at 500 matching IDs.

## Test topology and limits

Backend integration tests use `MongoMemoryReplSet` and Supertest. They cover schedule/booking concurrency, simultaneous slot claims/reschedules, reservation reconciliation, and injected audit failures. They do not establish behavior on a separately managed or production MongoDB deployment. There is no configured lint script or browser-based responsive test suite.

## Scaling

For millions of appointments: use query-plan driven compound indexes and archival/retention policy; paginate with indexed cursors for deep pages; cache low-churn doctor schedules with invalidation; move audit events to an append-only sink; add metrics and queue-backed notifications. Shard based on tenant/clinic and doctor/time access patterns, ensuring unique slot enforcement remains globally valid or co-locating reservation keys.


