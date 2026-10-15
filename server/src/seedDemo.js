import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import User from './models/User.js';
import Department from './models/Department.js';
import Doctor from './models/Doctor.js';
import Patient from './models/Patient.js';
import Appointment from './models/Appointment.js';
import SlotReservation from './models/SlotReservation.js';
import { audit } from './services/auditService.js';
import { inTransaction, assertTransactionTopology } from './services/transactionService.js';
import { dateAtTimezone, localDateTimeToUtc } from './utils/time.js';

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD;
if (env.NODE_ENV === 'production') {
  console.error('Demo seeding is disabled in production.');
  process.exit(1);
}
if (!DEMO_PASSWORD || DEMO_PASSWORD.length < 12) {
  console.error('Set DEMO_USER_PASSWORD (at least 12 characters) in the root .env before running the demo seeder.');
  process.exit(1);
}

const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
const demoUsers = [
  { name: 'Demo Doctor', email: 'doctor.demo@example.test', role: 'DOCTOR' },
  { name: 'Demo Receptionist', email: 'reception.demo@example.test', role: 'RECEPTIONIST' },
];
const patients = [
  { patientId: 'DEMO-P-001', name: 'Sample Patient One', mobile: '+12025550101', gender: 'PREFER_NOT_TO_SAY' },
  { patientId: 'DEMO-P-002', name: 'Sample Patient Two', mobile: '+12025550102', gender: 'PREFER_NOT_TO_SAY' },
];

try {
  await mongoose.connect(env.MONGODB_URI);
  await assertTransactionTopology();
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  await inTransaction(async (session) => {
    const admin = await User.findOne({ role: 'SUPER_ADMIN', isActive: true }).session(session);
    if (!admin) throw new Error('Create the super admin first with `npm run seed`.');

    let department = await Department.findOne({ name: 'DEMO - General Medicine' }).session(session);
    if (!department) [department] = await Department.create([{ name: 'DEMO - General Medicine', description: 'Synthetic demo department; no real patient data.' }], { session });

    const users = {};
    for (const input of demoUsers) {
      let user = await User.findOne({ email: input.email }).session(session);
      if (!user) [user] = await User.create([{ ...input, passwordHash }], { session });
      if (user.role !== input.role) throw new Error(`Existing ${input.email} account has an unexpected role; no changes were made.`);
      users[input.role] = user;
    }

    let doctor = await Doctor.findOne({ code: 'DEMO-GP-001' }).session(session);
    if (!doctor) {
      const schedule = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        dayOfWeek,
        sessions: [{ start: '09:00', end: '12:00', slotMinutes: 30, breaks: [{ start: '10:30', end: '10:45' }] }, { start: '13:00', end: '16:00', slotMinutes: 30, breaks: [] }],
      }));
      [doctor] = await Doctor.create([{ user: users.DOCTOR._id, code: 'DEMO-GP-001', department: department._id, specialization: 'General Medicine', timezone: 'Asia/Kolkata', schedule }], { session });
      users.DOCTOR.doctor = doctor._id;
      await users.DOCTOR.save({ session });
    }

    const patientDocs = [];
    for (const input of patients) {
      let patient = await Patient.findOne({ patientId: input.patientId }).session(session);
      if (!patient) [patient] = await Patient.create([input], { session });
      patientDocs.push(patient);
    }

    const adminDoc = { _id: admin._id, role: admin.role };
    const timezone = doctor.timezone || 'Asia/Kolkata';
    const [year, month, day] = dateAtTimezone(new Date(), timezone).split('-').map(Number);
    const bookedForDay = new Date(Date.UTC(year, month - 1, day + 1, 12));
    while (bookedForDay.getUTCDay() === 0 || bookedForDay.getUTCDay() === 6) bookedForDay.setUTCDate(bookedForDay.getUTCDate() + 1);
    const date = dateAtTimezone(bookedForDay, timezone);
    for (const [index, patient] of patientDocs.entries()) {
      const startAt = localDateTimeToUtc(date, index === 0 ? '09:00' : '09:30', timezone);
      const endAt = new Date(startAt.getTime() + 30 * 60_000);
      const existing = await Appointment.findOne({ patient: patient._id, doctor: doctor._id, purpose: 'Synthetic demo appointment' }).session(session);
      const appointment = existing ?? new Appointment({ patient: patient._id, doctor: doctor._id, department: department._id, createdBy: admin._id, purpose: 'Synthetic demo appointment' });
      if (appointment.status !== 'SCHEDULED') continue;
      if (existing) await SlotReservation.deleteOne({ appointment: existing._id }, { session });
      appointment.set({ department: department._id, startAt, endAt, createdBy: admin._id });
      await appointment.save({ session });
      await SlotReservation.create([{ doctor: doctor._id, startAt, endAt, appointment: appointment._id }], { session });
      await audit(adminDoc, 'DEMO_APPOINTMENT_SEEDED', 'Appointment', appointment._id, { synthetic: true }, appointment._id, session);
    }
  });
  console.info('Synthetic demo data is ready: one department, a doctor, a receptionist, two patients, and future appointments.');
  console.info('Demo staff login emails: doctor.demo@example.test and reception.demo@example.test. Use DEMO_USER_PASSWORD from .env.');
} catch (error) {
  console.error(`Demo seeding failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
