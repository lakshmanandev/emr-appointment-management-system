import test from 'node:test';
import assert from 'node:assert/strict';
import { dateAtTimezone, localDateTimeToUtc, dayOfWeekForDate } from '../utils/time.js';

test('converts schedule wall times to UTC using the requested IANA zone', () => {
  assert.equal(localDateTimeToUtc('2026-10-15', '09:00', 'Asia/Kolkata').toISOString(), '2026-10-15T03:30:00.000Z');
});
test("converts UTC instants back to the doctor's local calendar date", () => {
  assert.equal(dateAtTimezone(new Date('2026-10-14T20:00:00.000Z'), 'Asia/Kolkata'), '2026-10-15');
});
test('uses calendar date weekday rather than the host timezone', () => {
  assert.equal(dayOfWeekForDate('2026-10-15'), 4);
});
test('rejects invalid calendar dates and local times skipped by daylight saving', () => {
  assert.throws(() => localDateTimeToUtc('2026-02-30', '09:00', 'Asia/Kolkata'), /Invalid date or time/);
  assert.throws(() => localDateTimeToUtc('2026-03-08', '02:30', 'America/New_York'), /does not exist/);
});
