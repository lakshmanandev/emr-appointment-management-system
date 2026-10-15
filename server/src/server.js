import mongoose from 'mongoose';
import app from './app.js';
import { env } from './config/env.js';
import { assertTransactionTopology } from './services/transactionService.js';

try {
  await mongoose.connect(env.MONGODB_URI);
  await assertTransactionTopology();
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  app.listen(env.PORT, () => console.info(`EMR API listening on port ${env.PORT}`));
} catch (error) {
  console.error('Server startup failed', error.message);
  process.exit(1);
}
