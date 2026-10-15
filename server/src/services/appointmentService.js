import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import Patient from '../models/Patient.js';
import Doctor from '../models/Doctor.js';
import SlotReservation from '../models/SlotReservation.js';
import { audit } from './auditService.js';
import { inTransaction } from './transactionService.js';
import { listAvailableSlots } from './scheduleService.js';
import { dateAtTimezone, localDateTimeToUtc } from '../utils/time.js';
import { env } from '../config/env.js';
import { normalizePhone } from '../utils/phone.js';
import { AppError, conflict, notFound } from '../utils/errors.js';

export async function book(user, input) {
  const appointmentId = new mongoose.Types.ObjectId();
  const operationId = new mongoose.Types.ObjectId();
  try {
    return await inTransaction(async (session) => {
      const doctor = await Doctor.findOne({ _id: input.doctorId, department: input.departmentId, isActive: true }).select('_id timezone').session(session);
      if (!doctor) throw notFound('Doctor or department not found');
      await Doctor.updateOne({ _id: doctor._id }, { $inc: { scheduleRevision: 1 } }, { session });
      const date = dateAtTimezone(new Date(input.startAt), doctor.timezone || 'Asia/Kolkata');
      const slots = await listAvailableSlots({ doctorId: input.doctorId, departmentId: input.departmentId, date, session });
      const slot = slots?.find((s) => s.startAt.toISOString() === new Date(input.startAt).toISOString() && s.endAt.toISOString() === new Date(input.endAt).toISOString());
      if (!slot || !slot.available) throw conflict('Selected time is not an available schedule slot');
      const existingPatient = input.patientId ? await Patient.findById(input.patientId).session(session) : null;
      if (input.patientId && !existingPatient) throw notFound('Patient not found');
      await SlotReservation.create([{ doctor: doctor._id, startAt: slot.startAt, endAt: slot.endAt, appointment: appointmentId }], { session });
      const patient = existingPatient || (await Patient.create([{ patientId: input.newPatient.patientId, name: input.newPatient.name, mobile: input.newPatient.mobile, dateOfBirth: input.newPatient.dateOfBirth, gender: input.newPatient.gender }], { session }))[0];
      const [appointment] = await Appointment.create([{ _id: appointmentId, patient: patient._id, doctor: doctor._id, department: input.departmentId, startAt: slot.startAt, endAt: slot.endAt, purpose: input.purpose, createdBy: user._id }], { session });
      await audit(user, 'APPOINTMENT_CREATED', 'Appointment', appointment._id, { status: appointment.status }, operationId, session);
      return appointment;
    });
  } catch (error) { if (error.code === 11000) throw conflict('The selected appointment slot was just booked'); throw error; }
}

export async function updateAppointment(user, id, fields) {
  try {
    return await inTransaction(async (session) => {
      const appointment = await Appointment.findById(id).session(session);
      if (!appointment) throw notFound('Appointment not found');
      if (user.role === 'DOCTOR' && String(appointment.doctor) !== String(user.doctor)) throw new AppError(403, 'Forbidden', 'FORBIDDEN');
      if (user.role === 'DOCTOR' && (fields.purpose !== undefined || fields.startAt !== undefined)) throw new AppError(403, 'Doctors may update consultation notes only', 'FORBIDDEN');
      if (user.role !== 'DOCTOR' && fields.notes !== undefined) throw new AppError(403, 'Only the assigned doctor may update consultation notes', 'FORBIDDEN');
      if (fields.startAt && appointment.status !== 'SCHEDULED') throw new AppError(422, 'Only scheduled appointments can be rescheduled', 'INVALID_TRANSITION');
      if (user.role === 'DOCTOR' && !['ARRIVED', 'COMPLETED'].includes(appointment.status)) throw new AppError(422, 'Consultation notes can only be updated for arrived or completed appointments', 'INVALID_TRANSITION');
      if (appointment.status !== 'SCHEDULED' && user.role !== 'DOCTOR') throw new AppError(422, 'Only scheduled appointments can be updated', 'INVALID_TRANSITION');

      let event = 'APPOINTMENT_UPDATED'; let metadata = Object.keys(fields);
      const changes = { ...fields };
      if (fields.startAt) {
        const doctor = await Doctor.findById(appointment.doctor).select('_id department timezone').session(session);
        if (!doctor) throw notFound('Doctor not found');
        await Doctor.updateOne({ _id: doctor._id }, { $inc: { scheduleRevision: 1 } }, { session });
        const oldStart = appointment.startAt; const oldEnd = appointment.endAt;
        const date = dateAtTimezone(new Date(fields.startAt), doctor.timezone || 'Asia/Kolkata');
        const slots = await listAvailableSlots({ doctorId: doctor._id, departmentId: appointment.department, date, session });
        const slot = slots?.find((s) => s.startAt.toISOString() === fields.startAt && s.endAt.toISOString() === fields.endAt);
        if (!slot || (!slot.available && slot.startAt.getTime() !== oldStart.getTime())) throw conflict('Selected time is not an available schedule slot');
        const ownsOldReservation = await SlotReservation.exists({ appointment: appointment._id, startAt: oldStart }).session(session);
        if (slot.startAt.getTime() !== oldStart.getTime() || !ownsOldReservation) await SlotReservation.create([{ doctor: doctor._id, startAt: slot.startAt, endAt: slot.endAt, appointment: appointment._id }], { session });
        changes.startAt = slot.startAt; changes.endAt = slot.endAt;
        const moved = await Appointment.findOneAndUpdate({ _id: id, status: 'SCHEDULED', startAt: oldStart }, { $set: changes }, { new: true, session });
        if (!moved) throw new AppError(422, 'Appointment changed; reload before trying again', 'INVALID_TRANSITION');
        if (slot.startAt.getTime() !== oldStart.getTime()) await SlotReservation.deleteOne({ appointment: appointment._id, startAt: oldStart }, { session });
        event = 'APPOINTMENT_RESCHEDULED'; metadata = { from: oldStart.toISOString(), to: slot.startAt.toISOString() };
        await audit(user, event, 'Appointment', moved._id, metadata, new mongoose.Types.ObjectId(), session);
        return moved;
      }
      const updated = await Appointment.findOneAndUpdate({ _id: id, status: appointment.status }, { $set: changes }, { new: true, session });
      if (!updated) throw new AppError(422, 'Appointment changed; reload before trying again', 'INVALID_TRANSITION');
      await audit(user, event, 'Appointment', updated._id, metadata, new mongoose.Types.ObjectId(), session);
      return updated;
    });
  } catch (error) { if (error.code === 11000) throw conflict('The selected appointment slot was just booked'); throw error; }
}

export async function transition(user, id, action, reason) {
  return inTransaction(async (session) => {
    const existing = await Appointment.findById(id).select('doctor status').session(session);
    if (!existing) throw notFound('Appointment not found');
    if (user.role === 'DOCTOR' && String(existing.doctor) !== String(user.doctor)) throw new AppError(403, 'You cannot access another doctor appointment', 'FORBIDDEN');
    const map = { arrive: { from: ['SCHEDULED'], to: 'ARRIVED', audit: 'PATIENT_ARRIVED' }, complete: { from: ['ARRIVED'], to: 'COMPLETED', audit: 'APPOINTMENT_COMPLETED' }, cancel: { from: ['SCHEDULED', 'ARRIVED'], to: 'CANCELLED', audit: 'APPOINTMENT_CANCELLED' } };
    const rule = map[action];
    if (!rule || !rule.from.includes(existing.status)) throw new AppError(422, `Appointment cannot be ${action}d from ${existing.status}`, 'INVALID_TRANSITION');
    if (action === 'complete' && user.role !== 'DOCTOR') throw new AppError(403, 'Only the assigned doctor may complete this appointment', 'FORBIDDEN');
    const update = { status: rule.to };
    if (action === 'cancel') update.cancellation = { at: new Date(), by: user._id, reason };
    const appt = await Appointment.findOneAndUpdate({ _id: id, status: { $in: rule.from } }, { $set: update }, { new: true, session });
    if (!appt) throw new AppError(422, 'Appointment status changed; reload before trying again', 'INVALID_TRANSITION');
    if (action === 'cancel') await SlotReservation.deleteOne({ appointment: appt._id }, { session });
    await audit(user, rule.audit, 'Appointment', appt._id, { status: appt.status }, new mongoose.Types.ObjectId(), session);
    return appt;
  });
}

export async function list(user, query) {
  const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const filter = {};
  if (user.role === 'DOCTOR') filter.doctor = user.doctor;
  else if (query.doctorId) filter.doctor = query.doctorId;
  if (query.departmentId) filter.department = query.departmentId;
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    const range = {};
    let timeZone = env.APP_TIMEZONE;
    if (user.role === 'DOCTOR') timeZone = (await Doctor.findById(user.doctor).select('timezone').lean())?.timezone || timeZone;
    if (query.from) range.$gte = localDateTimeToUtc(query.from, '00:00', timeZone);
    if (query.to) { const exclusiveEnd = new Date(`${query.to}T12:00:00.000Z`); exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1); range.$lt = localDateTimeToUtc(exclusiveEnd.toISOString().slice(0, 10), '00:00', timeZone); }
    filter.startAt = range;
  }
  if (query.patient) {
    const escaped = query.patient.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const phone = normalizePhone(query.patient);
    const terms = [{ name: new RegExp(escaped, 'i') }, { patientId: new RegExp(escaped, 'i') }];
    if (phone) terms.push({ mobile: new RegExp(phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
    const patients = await Patient.find({ $or: terms }).select('_id').limit(500).lean();
    filter.patient = { $in: patients.map((p) => p._id) };
  }
  const sortFields = new Set(['startAt', 'createdAt', 'status']); const sortField = sortFields.has(query.sort) ? query.sort : 'startAt'; const direction = query.order === 'desc' ? -1 : 1;
  const [data, total] = await Promise.all([Appointment.find(filter).sort({ [sortField]: direction }).skip((page - 1) * limit).limit(limit).select('patient doctor department startAt endAt purpose status createdBy cancellation').populate('patient', 'patientId name mobile').populate('doctor', 'code specialization timezone user').populate({ path: 'doctor', populate: { path: 'user', select: 'name' } }).populate('department', 'name').lean(), Appointment.countDocuments(filter)]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
