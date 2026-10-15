import { AppError } from './errors.js';

export function localDateTimeToUtc(date, time, timeZone) {
  const [year, month, day] = date.split('-').map(Number); const [hour, minute] = time.split(':').map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite) || hour > 23 || minute > 59) throw new Error('Invalid date or time');
  const target = Date.UTC(year, month - 1, day, hour, minute);
  const calendar = new Date(target);
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) throw new Error('Invalid date or time');
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess));
    const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    guess += target - seen;
  }
  const check = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  if (+check.year !== year || +check.month !== month || +check.day !== day || +check.hour !== hour || +check.minute !== minute) throw new Error('This local time does not exist in the selected timezone');
  return new Date(guess);
}
export const minutes = (time) => { if (typeof time !== 'string' || !/^\d{2}:\d{2}$/.test(time)) throw new AppError(400, 'Time must use HH:mm format', 'INVALID_SCHEDULE'); const [h, m] = time.split(':').map(Number); if (h < 0 || h > 23 || m < 0 || m > 59) throw new AppError(400, 'Invalid schedule time', 'INVALID_SCHEDULE'); return h * 60 + m; };
export const dayOfWeekForDate = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function dateAtTimezone(instant, timeZone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
