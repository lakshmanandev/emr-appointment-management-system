import Doctor from '../models/Doctor.js';
import SlotReservation from '../models/SlotReservation.js';
import { localDateTimeToUtc, minutes, dayOfWeekForDate } from '../utils/time.js';
export async function listAvailableSlots({ doctorId, departmentId, date, session }) {
  const doctorQuery = Doctor.findOne({ _id: doctorId, department: departmentId, isActive: true }).select('schedule timezone name department');
  const doctor = await (session ? doctorQuery.session(session) : doctorQuery).lean();
  if (!doctor) return null;
  const day = dayOfWeekForDate(date); const schedule = doctor.schedule.find((x) => x.dayOfWeek === day);
  if (!schedule) return [];
  const now = new Date(); const slots = [];
  for (const session of schedule.sessions) {
    const slotMins = session.slotMinutes;
    for (let start = minutes(session.start); start + slotMins <= minutes(session.end); start += slotMins) {
      const end = start + slotMins;
      if ((session.breaks || []).some((b) => start < minutes(b.end) && end > minutes(b.start))) continue;
      const time = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
      const startAt = localDateTimeToUtc(date, time(start), doctor.timezone); const endAt = localDateTimeToUtc(date, time(end), doctor.timezone);
      if (startAt <= now) continue;
      slots.push({ startAt, endAt });
    }
  }
  if (!slots.length) return [];
  const occupiedQuery = SlotReservation.find({ doctor: doctorId, startAt: { $in: slots.map((s) => s.startAt) } }).select('startAt');
  const occupied = await (session ? occupiedQuery.session(session) : occupiedQuery).lean();
  const busy = new Set(occupied.map((x) => x.startAt.toISOString()));
  return slots.map((slot) => ({ ...slot, available: !busy.has(slot.startAt.toISOString()) }));
}
