import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import Doctor from '../models/Doctor.js';
import Department from '../models/Department.js';
import SlotReservation from '../models/SlotReservation.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { listAvailableSlots } from '../services/scheduleService.js';
import { validateSessions } from '../services/scheduleRules.js';
import { audit } from '../services/auditService.js';
import { inTransaction } from '../services/transactionService.js';
import { AppError, notFound } from '../utils/errors.js';
import { dayOfWeekForDate, localDateTimeToUtc, minutes } from '../utils/time.js';
import { ok } from '../utils/response.js';

const router = Router();
router.use(authenticate);
router.get('/', async (_req, res, next) => {
  try { ok(res, await Doctor.find({ isActive: true }).select('code specialization department user timezone').populate('department', 'name').populate('user', 'name').lean()); }
  catch (e) { next(e); }
});
router.get('/slots', async (req, res, next) => {
  try {
    const query = z.object({ doctorId: z.string().regex(/^[a-f\d]{24}$/i), departmentId: z.string().regex(/^[a-f\d]{24}$/i), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(req.query);
    const day = new Date(`${query.date}T00:00:00Z`);
    if (Number.isNaN(day.valueOf()) || day.toISOString().slice(0, 10) !== query.date) throw new AppError(400, 'Invalid date', 'VALIDATION_ERROR');
    if (day < new Date(new Date().toISOString().slice(0, 10))) throw new AppError(400, 'Past dates are not bookable', 'PAST_DATE');
    const data = await listAvailableSlots(query);
    if (data === null) throw notFound('Doctor or department not found');
    ok(res, data);
  } catch (e) { next(e); }
});
router.put('/:id/schedule', allowRoles('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const body = z.object({
      schedule: z.array(z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        sessions: z.array(z.object({
          start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/),
          slotMinutes: z.number().int().min(5).max(240),
          breaks: z.array(z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) })).default([]),
        })),
      })),
      timezone: z.string().min(1).default('Asia/Kolkata'),
    }).parse(req.body);
    new Intl.DateTimeFormat('en-US', { timeZone: body.timezone });
    const seen = new Set();
    for (const day of body.schedule) {
      if (seen.has(day.dayOfWeek)) throw new AppError(400, 'Duplicate schedule day', 'VALIDATION_ERROR');
      seen.add(day.dayOfWeek); validateSessions(day.sessions);
    }
    const doc = await inTransaction(async (session) => {
      const current = await Doctor.findById(req.params.id).select('_id').session(session);
      if (!current) throw notFound('Doctor not found');
      const reservations = await SlotReservation.find({ doctor: current._id, startAt: { $gte: new Date() } }).select('startAt endAt').session(session).lean();
      for (const reservation of reservations) {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: body.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(reservation.startAt).map((p) => [p.type, p.value]));
        const date = `${parts.year}-${parts.month}-${parts.day}`;
        const day = body.schedule.find((item) => item.dayOfWeek === dayOfWeekForDate(date));
        const preserved = day?.sessions.some((session) => {
          const step = session.slotMinutes;
          for (let startMins = minutes(session.start); startMins + step <= minutes(session.end); startMins += step) {
            const endMins = startMins + step;
            const intersectsBreak = (session.breaks || []).some((br) => startMins < minutes(br.end) && endMins > minutes(br.start));
            const start = localDateTimeToUtc(date, `${String(Math.floor(startMins / 60)).padStart(2, '0')}:${String(startMins % 60).padStart(2, '0')}`, body.timezone);
            const end = localDateTimeToUtc(date, `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`, body.timezone);
            if (!intersectsBreak && start.getTime() === reservation.startAt.getTime() && end.getTime() === reservation.endAt.getTime()) return true;
          }
          return false;
        });
        if (!preserved) throw new AppError(409, 'Schedule cannot remove or move a slot with an upcoming reservation', 'SCHEDULE_HAS_BOOKINGS');
      }
      const updated = await Doctor.findByIdAndUpdate(req.params.id, { $set: body, $inc: { scheduleRevision: 1 } }, { new: true, runValidators: true, session });
      await audit(req.user, 'DOCTOR_SCHEDULE_UPDATED', 'Doctor', updated._id, { dayCount: body.schedule.length }, new mongoose.Types.ObjectId(), session);
      return updated;
    });
    ok(res, doc);
  } catch (e) { next(e); }
});
router.get('/departments', async (_req, res, next) => {
  try { ok(res, await Department.find({ isActive: true }).select('name description').lean()); }
  catch (e) { next(e); }
});
export default router;
