import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSessions } from '../services/scheduleRules.js';

test('accepts ordered working sessions and valid breaks', () => {
  const sessions = validateSessions([{ start: '13:00', end: '14:00', slotMinutes: 20, breaks: [] }, { start: '09:00', end: '10:00', slotMinutes: 20, breaks: [{ start: '09:20', end: '09:40' }] }]);
  assert.equal(sessions[0].start, '09:00');
});
test('rejects overlapping sessions and breaks outside a session', () => {
  assert.throws(() => validateSessions([{ start: '09:00', end: '10:00', slotMinutes: 20 }, { start: '09:40', end: '10:20', slotMinutes: 20 }]), { code: 'INVALID_SCHEDULE' });
  assert.throws(() => validateSessions([{ start: '09:00', end: '10:00', slotMinutes: 20, breaks: [{ start: '09:50', end: '10:10' }] }]), { code: 'INVALID_SCHEDULE' });
});
test('rejects malformed time and zero-length sessions', () => {
  assert.throws(() => validateSessions([{ start: '9:00', end: '10:00', slotMinutes: 20 }]), { status: 400 });
  assert.throws(() => validateSessions([{ start: '10:00', end: '10:00', slotMinutes: 20 }]), { status: 400 });
});
