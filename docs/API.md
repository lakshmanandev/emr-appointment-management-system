# API guide

All endpoints use `/api/v1`; JSON responses include `success` and `data`. Protected routes accept `Authorization: Bearer <accessToken>`. Login/refresh use an HTTP-only refresh cookie. Appointment timestamps are ISO 8601 instants; schedule wall times use the doctor's IANA timezone. Appointment-list `from`/`to` calendar dates use `APP_TIMEZONE` for front-desk/admin users and the assigned doctor's timezone for doctor users.

## Authentication

```http
POST /api/v1/auth/login
Content-Type: application/json
{"email":"reception@hospital.test","password":"your-secret"}
```

Returns `{success:true,data:{accessToken,user}}`; the refresh token is set as an HTTP-only cookie. `POST /auth/refresh` rotates it. `POST /auth/logout` invalidates the current refresh token.

## Slots and booking

`GET /doctors` lists active clinicians. `GET /doctors/departments` lists active departments. `GET /doctors/slots?doctorId=<id>&departmentId=<id>&date=2026-10-15` returns `{data:[{startAt,endAt,available}]}`.

```http
POST /appointments
Authorization: Bearer <token>
Content-Type: application/json
{"patientId":"<patient ObjectId>","doctorId":"<doctor ObjectId>","departmentId":"<department ObjectId>","startAt":"2026-10-15T03:30:00.000Z","endAt":"2026-10-15T03:45:00.000Z","purpose":"Consultation"}
```

For a new patient, replace `patientId` with `newPatient:{patientId,name,mobile,dateOfBirth?,gender?}`. A concurrent slot conflict returns 409. The unique `SlotReservation(doctor,startAt)` index is the authoritative booking guard. `DELETE /appointments/:id` is a cancellation, and releases that reservation after the status update. Its optional JSON body accepts `{"reason":"Patient request"}` (maximum 500 characters); an invalid workflow transition returns 422.

## Appointment operations

- `GET /appointments?page=1&limit=10&patient=...&doctorId=...&departmentId=...&status=SCHEDULED&from=...&to=...&sort=startAt&order=asc` returns rows and pagination metadata.
- `GET /appointments/:id` retrieves an appointment (doctor role is restricted to their assigned doctor profile).
- `PUT /appointments/:id` updates `purpose` and/or consultation `notes`; receptionists/admins may also send a paired `startAt` and `endAt` to reschedule a scheduled appointment. The new reservation is acquired before the appointment is moved.
- `POST /appointments/:id/arrive` marks a scheduled visit arrived (receptionist/admin).
- `POST /appointments/:id/complete` completes an arrived visit (doctor).
- `PUT /doctors/:id/schedule` updates schedule configuration (admin); an update that would remove or move an upcoming reserved slot returns 409.
- `GET /dashboard` returns today's status counts scoped to the logged-in doctor when applicable.
- `POST /admin/departments` creates a department (super admin).
- `GET /admin/doctors` and `GET /admin/receptionists` return bounded staff rosters (super admin; sensitive account fields are omitted).
- `POST /admin/doctors` provisions a doctor user and professional profile (super admin; password must be at least 12 characters).
- `POST /admin/receptionists` provisions a receptionist (super admin; password must be at least 12 characters).

Errors use `{success:false,error:{code,message}}`. Common status codes are 400 validation, 401 authentication, 403 role/ownership, 404 missing resource, 409 booking conflict, 422 invalid workflow transition and 429 login rate limit.

## Deployment requirement

The API requires MongoDB 6+ on a replica set or through `mongos`. Booking, rescheduling, cancellation, schedule edits, and their audit events use multi-document transactions. Standalone MongoDB is rejected at API startup. Appointment-list doctor and department filters are passed as `doctorId` and `departmentId`.
