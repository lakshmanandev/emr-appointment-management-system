import Appointment from '../models/Appointment.js';
import SlotReservation from '../models/SlotReservation.js';
import AuditLog from '../models/AuditLog.js';
import { inTransaction } from './transactionService.js';

export async function reconcileReservations() {
  let inspected = 0; let removed = 0; let preserved = 0;
  const candidates = SlotReservation.find().select('_id appointment').lean().cursor();
  for await (const candidate of candidates) {
    inspected += 1;
    const didRemove = await inTransaction(async (session) => {
      const reservation = await SlotReservation.findById(candidate._id).session(session);
      if (!reservation) return false;
      const appointment = await Appointment.findById(reservation.appointment).select('status').session(session);
      if (appointment && appointment.status !== 'CANCELLED') return false;
      await SlotReservation.deleteOne({ _id: reservation._id }, { session });
      await AuditLog.create([{ action: 'ORPHAN_RESERVATION_RECONCILED', entityType: 'SlotReservation', entityId: reservation._id, metadata: { appointmentId: reservation.appointment, appointmentFound: Boolean(appointment) } }], { session });
      return true;
    });
    if (didRemove) removed += 1; else preserved += 1;
  }
  return { inspected, removed, preserved };
}
