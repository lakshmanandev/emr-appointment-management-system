import { minutes } from '../utils/time.js';
import { AppError } from '../utils/errors.js';

const invalid = (message) => { throw new AppError(400, message, 'INVALID_SCHEDULE'); };
export function validateSessions(sessions) {
  if (!Array.isArray(sessions) || !sessions.length) invalid('At least one working session is required');
  const ordered = [...sessions].sort((a, b) => minutes(a.start) - minutes(b.start));
  for (const s of ordered) {
    if (minutes(s.start) >= minutes(s.end) || !Number.isInteger(s.slotMinutes) || s.slotMinutes < 5 || (minutes(s.end) - minutes(s.start)) % s.slotMinutes !== 0) invalid('Invalid session or slot duration');
    let end = minutes(s.start);
    for (const b of [...(s.breaks || [])].sort((a, c) => minutes(a.start) - minutes(c.start))) {
      const start = minutes(b.start), stop = minutes(b.end);
      if (start < minutes(s.start) || stop > minutes(s.end) || start >= stop || start < end) invalid('Breaks must be valid and non-overlapping within a session');
      end = stop;
    }
  }
  for (let i = 1; i < ordered.length; i++) if (minutes(ordered[i - 1].end) > minutes(ordered[i].start)) invalid('Working sessions cannot overlap');
  return ordered;
}
