import mongoose from 'mongoose';
import { AppError } from '../utils/errors.js';

export async function assertTransactionTopology(connection = mongoose.connection) {
  const hello = await connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') throw new AppError(503, 'MongoDB replica set or mongos is required for appointment transactions', 'TRANSACTIONS_REQUIRED');
}

export async function inTransaction(work) {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
    return result;
  } finally {
    await session.endSession();
  }
}
