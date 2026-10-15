import { Router } from 'express';
import Appointment from '../models/Appointment.js';
import Doctor from '../models/Doctor.js';
import { authenticate } from '../middleware/auth.js';
import { ok } from '../utils/response.js';
import { dateAtTimezone, localDateTimeToUtc } from '../utils/time.js';
import { env } from '../config/env.js';
const router = Router();
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try {
    const timeZone = req.user.role === 'DOCTOR' ? (await Doctor.findById(req.user.doctor).select('timezone').lean())?.timezone || env.APP_TIMEZONE : env.APP_TIMEZONE;
    const date = dateAtTimezone(new Date(), timeZone);
    const nextDay = new Date(`${date}T12:00:00Z`); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDate = nextDay.toISOString().slice(0, 10);
    const base = { startAt: { $gte: localDateTimeToUtc(date, '00:00', timeZone), $lt: localDateTimeToUtc(nextDate, '00:00', timeZone) }, ...(req.user.role === 'DOCTOR' ? { doctor: req.user.doctor } : {}) };
    const statuses = ['SCHEDULED', 'ARRIVED', 'COMPLETED', 'CANCELLED'];
    const counts = await Promise.all(statuses.map(async (status) => [status, await Appointment.countDocuments({ ...base, status })]));
    ok(res, { date, timeZone, today: Object.fromEntries(counts) });
  } catch (e) { next(e); }
});
export default router;
