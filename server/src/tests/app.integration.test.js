import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { localDateTimeToUtc } from '../utils/time.js';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'integration-test-access-secret-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'integration-test-refresh-secret-32-characters-long';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.LOGIN_RATE_LIMIT_MAX = '100';

let mongod; let app; let request; let admin; let receptionist; let doctorUser; let doctor; let department; let patientA; let patientB; let date; let startAt; let endAt;
const dayOffsetDate = (offset) => { const value = new Date(); value.setUTCDate(value.getUTCDate() + offset); return value.toISOString().slice(0, 10); };
async function login(email) { const response = await request.post('/api/v1/auth/login').send({ email, password: 'Test-password-12345' }); assert.equal(response.status, 200); return response.body.data.accessToken; }
const auth = (token) => ({ Authorization: `Bearer ${token}` });
async function createBooking(token, patientId = patientA._id) { return request.post('/api/v1/appointments').set(auth(token)).send({ patientId, doctorId: doctor._id, departmentId: department._id, startAt: startAt.toISOString(), endAt: endAt.toISOString(), purpose: 'Assessment' }); }

before(async () => {
  mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = mongod.getUri();
  await mongoose.connect(process.env.MONGODB_URI);
  const imported = await import('../app.js'); app = imported.default;
  request = (await import('supertest')).default(app);
  const User = (await import('../models/User.js')).default;
  const models = await Promise.all(['User', 'Department', 'Doctor', 'Patient', 'Appointment', 'SlotReservation', 'AuditLog'].map((name) => mongoose.model(name).init()));
  await Promise.all(models);
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})));
  const User = (await import('../models/User.js')).default;
  const Department = (await import('../models/Department.js')).default;
  const Doctor = (await import('../models/Doctor.js')).default;
  const Patient = (await import('../models/Patient.js')).default;
  const passwordHash = await bcrypt.hash('Test-password-12345', 4);
  [admin, receptionist, doctorUser] = await User.create([
    { name: 'Admin', email: 'admin@test.local', passwordHash, role: 'SUPER_ADMIN' },
    { name: 'Reception', email: 'reception@test.local', passwordHash, role: 'RECEPTIONIST' },
    { name: 'Doctor', email: 'doctor@test.local', passwordHash, role: 'DOCTOR' },
  ]);
  department = await Department.create({ name: 'General Medicine' });
  date = dayOffsetDate(5);
  const scheduleDay = new Date(`${date}T12:00:00Z`).getUTCDay();
  doctor = await Doctor.create({ user: doctorUser._id, code: 'DOC-1', department: department._id, specialization: 'General medicine', timezone: 'Asia/Kolkata', schedule: [{ dayOfWeek: scheduleDay, sessions: [{ start: '09:00', end: '11:00', slotMinutes: 20, breaks: [{ start: '09:40', end: '10:00' }] }] }] });
  doctorUser.doctor = doctor._id; await doctorUser.save();
  patientA = await Patient.create({ patientId: 'PT-1001', name: 'Patient One', mobile: '+919876543210' });
  patientB = await Patient.create({ patientId: 'PT-1002', name: 'Patient Two', mobile: '+919876543211' });
  startAt = localDateTimeToUtc(date, '09:00', 'Asia/Kolkata'); endAt = localDateTimeToUtc(date, '09:20', 'Asia/Kolkata');
});

after(async () => { await mongoose.disconnect(); await mongod?.stop(); });

test('login issues access token and rotates the HTTP-only refresh cookie', async () => {
  const agent = (await import('supertest')).default.agent(app);
  const invalid = await agent.post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'wrong' });
  assert.equal(invalid.status, 401);
  const loginResponse = await agent.post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'Test-password-12345' });
  assert.equal(loginResponse.status, 200); assert.ok(loginResponse.body.data.accessToken);
  assert.match(loginResponse.headers['set-cookie'][0], /HttpOnly/i);
  const originalCookie = loginResponse.headers['set-cookie'][0].split(';')[0];
  const refreshed = await agent.post('/api/v1/auth/refresh');
  assert.equal(refreshed.status, 200); assert.ok(refreshed.body.data.accessToken);
  const rotatedCookie = refreshed.headers['set-cookie'][0].split(';')[0];
  const replayed = await request.post('/api/v1/auth/refresh').set('Cookie', originalCookie); assert.equal(replayed.status, 401);
  await agent.post('/api/v1/auth/logout');
  const revoked = await request.post('/api/v1/auth/refresh').set('Cookie', rotatedCookie); assert.equal(revoked.status, 401);
});

test('a new login replaces the previous browser refresh session', async () => {
  const firstSession = (await import('supertest')).default.agent(app);
  const secondSession = (await import('supertest')).default.agent(app);
  const firstLogin = await firstSession.post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'Test-password-12345' });
  const oldCookie = firstLogin.headers['set-cookie'][0].split(';')[0];
  const secondLogin = await secondSession.post('/api/v1/auth/login').send({ email: 'admin@test.local', password: 'Test-password-12345' });
  assert.equal(secondLogin.status, 200);
  const oldBrowserRefresh = await request.post('/api/v1/auth/refresh').set('Cookie', oldCookie);
  assert.equal(oldBrowserRefresh.status, 401);
});

test('admin endpoints reject receptionist role and allow super admin', async () => {
  const receptionistToken = await login('reception@test.local'); const adminToken = await login('admin@test.local');
  const forbidden = await request.post('/api/v1/admin/departments').set(auth(receptionistToken)).send({ name: 'Neurology' });
  assert.equal(forbidden.status, 403);
  const created = await request.post('/api/v1/admin/receptionists').set(auth(adminToken)).send({ name: 'New Desk', email: 'newdesk@test.local', password: 'Another-test-password-99' });
  assert.equal(created.status, 201); assert.equal(created.body.data.role, 'RECEPTIONIST'); assert.equal('passwordHash' in created.body.data, false);
});

test('super admin provisions doctors and saves validated multi-session schedules', async () => {
  const adminToken = await login('admin@test.local'); const receptionToken = await login('reception@test.local');
  const created = await request.post('/api/v1/admin/doctors').set(auth(adminToken)).send({ name: 'New Clinician', email: 'newdoctor@test.local', password: 'New-doctor-password-77', code: 'DOC-NEW', departmentId: department._id.toString(), specialization: 'Family Medicine', timezone: 'Asia/Kolkata' });
  assert.equal(created.status, 201); const newDoctorId = created.body.data.id;
  const schedule = { timezone: 'Asia/Kolkata', schedule: [{ dayOfWeek: 1, sessions: [{ start: '09:00', end: '10:00', slotMinutes: 20, breaks: [{ start: '09:20', end: '09:40' }] }, { start: '11:00', end: '12:00', slotMinutes: 20, breaks: [] }] }] };
  const denied = await request.put(`/api/v1/doctors/${newDoctorId}/schedule`).set(auth(receptionToken)).send(schedule); assert.equal(denied.status, 403);
  const saved = await request.put(`/api/v1/doctors/${newDoctorId}/schedule`).set(auth(adminToken)).send(schedule); assert.equal(saved.status, 200); assert.equal(saved.body.data.schedule[0].sessions.length, 2);
  const invalid = await request.put(`/api/v1/doctors/${newDoctorId}/schedule`).set(auth(adminToken)).send({ ...schedule, schedule: [{ dayOfWeek: 1, sessions: [{ start: '09:00', end: '10:00', slotMinutes: 20 }, { start: '09:40', end: '10:20', slotMinutes: 20 }] }] }); assert.equal(invalid.status, 400);
});

test('booking rejects unauthenticated requests and duplicate active slots', async () => {
  const unauthenticated = await request.post('/api/v1/appointments').send({}); assert.equal(unauthenticated.status, 401);
  const token = await login('reception@test.local');
  const first = await createBooking(token); assert.equal(first.status, 201);
  const duplicate = await createBooking(token, patientB._id); assert.equal(duplicate.status, 409);
});

test('reception can register a patient during booking', async () => {
  const token = await login('reception@test.local');
  const created = await request.post('/api/v1/appointments').set(auth(token)).send({ doctorId: doctor._id, departmentId: department._id, startAt: startAt.toISOString(), endAt: endAt.toISOString(), newPatient: { patientId: 'PT-NEW', name: 'New Patient', mobile: '+91 (98765) 43210' } });
  assert.equal(created.status, 201);
  assert.ok(created.body.data.patient);
  const stored = await mongoose.model('Patient').findById(created.body.data.patient).lean();
  assert.equal(stored.mobile, '+919876543210');
});

test('a new patient is not created when its requested slot is already reserved', async () => {
  const token = await login('reception@test.local');
  assert.equal((await createBooking(token)).status, 201);
  const conflict = await request.post('/api/v1/appointments').set(auth(token)).send({ doctorId: doctor._id, departmentId: department._id, startAt: startAt.toISOString(), endAt: endAt.toISOString(), newPatient: { patientId: 'PT-ORPHAN', name: 'Conflict Patient', mobile: '+919876543212' } });
  assert.equal(conflict.status, 409);
  assert.equal(await mongoose.model('Patient').countDocuments({ patientId: 'PT-ORPHAN' }), 0);
});

test('cancellation releases a slot and retains the appointment record', async () => {
  const token = await login('reception@test.local'); const created = await createBooking(token);
  const cancelled = await request.delete(`/api/v1/appointments/${created.body.data._id}`).set(auth(token)).send({ reason: 'Patient request' });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.data.status, 'CANCELLED');
  const rebooked = await createBooking(token, patientB._id); assert.equal(rebooked.status, 201);
  const retained = await request.get(`/api/v1/appointments/${created.body.data._id}`).set(auth(token)); assert.equal(retained.status, 200); assert.equal(retained.body.data.status, 'CANCELLED');
});

test('rescheduling reserves the new slot and releases the previous slot', async () => {
  const token = await login('reception@test.local'); const created = await createBooking(token);
  const nextStart = localDateTimeToUtc(date, '10:00', 'Asia/Kolkata'); const nextEnd = localDateTimeToUtc(date, '10:20', 'Asia/Kolkata');
  const moved = await request.put(`/api/v1/appointments/${created.body.data._id}`).set(auth(token)).send({ startAt: nextStart.toISOString(), endAt: nextEnd.toISOString() });
  assert.equal(moved.status, 200); assert.equal(new Date(moved.body.data.startAt).toISOString(), nextStart.toISOString());
  const oldSlot = await request.get('/api/v1/doctors/slots').set(auth(token)).query({ doctorId: doctor._id.toString(), departmentId: department._id.toString(), date });
  const old = oldSlot.body.data.find((s) => s.startAt === startAt.toISOString()); const next = oldSlot.body.data.find((s) => s.startAt === nextStart.toISOString());
  assert.equal(old.available, true); assert.equal(next.available, false);
});

test('schedule changes cannot move a slot that already has an upcoming reservation', async () => {
  const token = await login('reception@test.local');
  assert.equal((await createBooking(token)).status, 201);
  const adminToken = await login('admin@test.local');
  const schedule = { timezone: 'Asia/Kolkata', schedule: [{ dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(), sessions: [{ start: '09:20', end: '11:00', slotMinutes: 20, breaks: [] }] }] };
  const update = await request.put(`/api/v1/doctors/${doctor._id}/schedule`).set(auth(adminToken)).send(schedule);
  assert.equal(update.status, 409);
  assert.equal(update.body.error.code, 'SCHEDULE_HAS_BOOKINGS');
});

test('concurrent schedule edit and booking cannot both commit an invalid slot', async () => {
  const receptionistToken = await login('reception@test.local'); const adminToken = await login('admin@test.local');
  const changedSchedule = { timezone: 'Asia/Kolkata', schedule: [{ dayOfWeek: new Date(`${date}T12:00:00Z`).getUTCDay(), sessions: [{ start: '09:20', end: '11:20', slotMinutes: 20, breaks: [] }] }] };
  const [booking, schedule] = await Promise.all([
    createBooking(receptionistToken),
    request.put(`/api/v1/doctors/${doctor._id}/schedule`).set(auth(adminToken)).send(changedSchedule),
  ]);
  assert.ok((booking.status === 201 && schedule.status === 409) || (booking.status === 409 && schedule.status === 200));
  const reservations = await mongoose.model('SlotReservation').find({ doctor: doctor._id }).lean();
  const appointments = await mongoose.model('Appointment').find({ doctor: doctor._id, status: 'SCHEDULED' }).lean();
  assert.equal(reservations.length, appointments.length);
});

test('audit failures roll booking, rescheduling, and cancellation back atomically', async () => {
  const AuditLog = (await import('../models/AuditLog.js')).default;
  const originalUpdateOne = AuditLog.collection.updateOne;
  const token = await login('reception@test.local');
  AuditLog.collection.updateOne = async () => { throw new Error('injected audit storage failure'); };
  try {
    const failedBooking = await createBooking(token);
    assert.equal(failedBooking.status, 500);
    assert.equal(await mongoose.model('Appointment').countDocuments({}), 0);
    assert.equal(await mongoose.model('SlotReservation').countDocuments({}), 0);

    const adminToken = await login('admin@test.local');
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const failedSchedule = await request.put(`/api/v1/doctors/${doctor._id}/schedule`).set(auth(adminToken)).send({ timezone: 'Asia/Kolkata', schedule: [{ dayOfWeek: day, sessions: [{ start: '11:00', end: '13:00', slotMinutes: 20, breaks: [] }] }] });
    assert.equal(failedSchedule.status, 500);
    assert.equal((await mongoose.model('Doctor').findById(doctor._id).lean()).schedule[0].sessions[0].start, '09:00');

    AuditLog.collection.updateOne = originalUpdateOne;
    const created = await createBooking(token);
    assert.equal(created.status, 201);
    AuditLog.collection.updateOne = async () => { throw new Error('injected audit storage failure'); };
    const newStart = localDateTimeToUtc(date, '10:00', 'Asia/Kolkata').toISOString();
    const newEnd = localDateTimeToUtc(date, '10:20', 'Asia/Kolkata').toISOString();
    const failedReschedule = await request.put(`/api/v1/appointments/${created.body.data._id}`).set(auth(token)).send({ startAt: newStart, endAt: newEnd });
    assert.equal(failedReschedule.status, 500);
    const originalAppointment = await mongoose.model('Appointment').findById(created.body.data._id).lean();
    assert.equal(originalAppointment.startAt.toISOString(), startAt.toISOString());
    assert.equal(await mongoose.model('SlotReservation').countDocuments({ appointment: created.body.data._id }), 1);

    AuditLog.collection.updateOne = originalUpdateOne;
    AuditLog.collection.updateOne = async () => { throw new Error('injected audit storage failure'); };
    const failedCancel = await request.delete(`/api/v1/appointments/${created.body.data._id}`).set(auth(token));
    assert.equal(failedCancel.status, 500);
    const unchanged = await mongoose.model('Appointment').findById(created.body.data._id).lean();
    assert.equal(unchanged.status, 'SCHEDULED');
    assert.equal(await mongoose.model('SlotReservation').countDocuments({ appointment: created.body.data._id }), 1);
  } finally { AuditLog.collection.updateOne = originalUpdateOne; }
});

test('reservation reconciliation removes only unreferenced or cancelled reservations', async () => {
  const token = await login('reception@test.local'); const created = await createBooking(token);
  const activeStart = localDateTimeToUtc(date, '10:00', 'Asia/Kolkata'); const activeEnd = localDateTimeToUtc(date, '10:20', 'Asia/Kolkata');
  const active = await request.post('/api/v1/appointments').set(auth(token)).send({ patientId: patientB._id, doctorId: doctor._id, departmentId: department._id, startAt: activeStart.toISOString(), endAt: activeEnd.toISOString() });
  assert.equal(active.status, 201);
  const SlotReservation = (await import('../models/SlotReservation.js')).default;
  const Appointment = (await import('../models/Appointment.js')).default;
  const { reconcileReservations } = await import('../services/reservationReconciliationService.js');
  const orphanId = new mongoose.Types.ObjectId();
  await SlotReservation.create({ doctor: doctor._id, startAt: localDateTimeToUtc(date, '10:20', 'Asia/Kolkata'), endAt: localDateTimeToUtc(date, '10:40', 'Asia/Kolkata'), appointment: orphanId });
  await Appointment.updateOne({ _id: created.body.data._id }, { $set: { status: 'CANCELLED' } });
  const result = await reconcileReservations();
  assert.deepEqual(result, { inspected: 3, removed: 2, preserved: 1 });
  assert.equal(await SlotReservation.countDocuments({ appointment: active.body.data._id }), 1);
});

test('reservation reconciliation cannot remove a concurrently committing booking', async () => {
  const token = await login('reception@test.local');
  const { reconcileReservations } = await import('../services/reservationReconciliationService.js');
  const [booking] = await Promise.all([createBooking(token), reconcileReservations()]);
  assert.equal(booking.status, 201);
  assert.equal(await mongoose.model('SlotReservation').countDocuments({ appointment: booking.body.data._id }), 1);
});

test('simultaneous booking requests for one doctor slot yield exactly one winner', async () => {
  const token = await login('reception@test.local');
  const responses = await Promise.all([createBooking(token, patientA._id), createBooking(token, patientB._id)]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
});

test('simultaneous reschedules to one destination yield exactly one winner', async () => {
  const token = await login('reception@test.local');
  const first = await createBooking(token, patientA._id);
  const secondStart = localDateTimeToUtc(date, '10:00', 'Asia/Kolkata');
  const secondEnd = localDateTimeToUtc(date, '10:20', 'Asia/Kolkata');
  const second = await request.post('/api/v1/appointments').set(auth(token)).send({ patientId: patientB._id, doctorId: doctor._id, departmentId: department._id, startAt: secondStart.toISOString(), endAt: secondEnd.toISOString() });
  assert.equal(second.status, 201);
  const targetStart = localDateTimeToUtc(date, '10:20', 'Asia/Kolkata').toISOString();
  const targetEnd = localDateTimeToUtc(date, '10:40', 'Asia/Kolkata').toISOString();
  const responses = await Promise.all([first, second].map((booking) => request.put(`/api/v1/appointments/${booking.body.data._id}`).set(auth(token)).send({ startAt: targetStart, endAt: targetEnd })));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
});

test('doctor ownership is enforced and the assigned doctor may complete a visit', async () => {
  const receptionistToken = await login('reception@test.local'); const created = await createBooking(receptionistToken);
  const User = (await import('../models/User.js')).default; const Doctor = (await import('../models/Doctor.js')).default;
  const otherUser = await User.create({ name: 'Other Doctor', email: 'other@test.local', passwordHash: doctorUser.passwordHash, role: 'DOCTOR' });
  const otherDoctor = await Doctor.create({ user: otherUser._id, code: 'DOC-2', department: department._id, specialization: 'Neurology', timezone: 'Asia/Kolkata' }); otherUser.doctor = otherDoctor._id; await otherUser.save();
  const otherToken = await login('other@test.local');
  const forbiddenDetail = await request.get(`/api/v1/appointments/${created.body.data._id}`).set(auth(otherToken)); assert.equal(forbiddenDetail.status, 403);
  const otherList = await request.get('/api/v1/appointments').set(auth(otherToken)); assert.equal(otherList.body.pagination.total, 0);
  const arrived = await request.post(`/api/v1/appointments/${created.body.data._id}/arrive`).set(auth(receptionistToken)); assert.equal(arrived.status, 200);
  const forbiddenComplete = await request.post(`/api/v1/appointments/${created.body.data._id}/complete`).set(auth(otherToken)); assert.equal(forbiddenComplete.status, 403);
  const doctorToken = await login('doctor@test.local');
  const completed = await request.post(`/api/v1/appointments/${created.body.data._id}/complete`).set(auth(doctorToken)); assert.equal(completed.status, 200);
  const forbidden = await request.put(`/api/v1/appointments/${created.body.data._id}`).set(auth(doctorToken)).send({ purpose: 'Unauthorized change' }); assert.equal(forbidden.status, 403);
});
