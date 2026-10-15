import mongoose from 'mongoose';
import { env } from './config/env.js';
import { assertTransactionTopology } from './services/transactionService.js';
import { reconcileReservations } from './services/reservationReconciliationService.js';
try {
  await mongoose.connect(env.MONGODB_URI);
  await assertTransactionTopology();
  const result = await reconcileReservations();
  console.info(`Reservation reconciliation complete: ${result.inspected} inspected, ${result.removed} removed, ${result.preserved} preserved.`);
} catch (error) {
  console.error('Reservation reconciliation failed:', error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
