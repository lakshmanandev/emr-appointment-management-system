import test from 'node:test';
import assert from 'node:assert/strict';
import { assertTransactionTopology } from '../services/transactionService.js';

test('transaction topology check rejects a standalone MongoDB hello response', async () => {
  const connection = { db: { admin: () => ({ command: async () => ({ ok: 1, isWritablePrimary: true }) }) } };
  await assert.rejects(assertTransactionTopology(connection), (error) => error.code === 'TRANSACTIONS_REQUIRED');
});

test('transaction topology check accepts a replica set or mongos', async () => {
  const replicaSet = { db: { admin: () => ({ command: async () => ({ ok: 1, setName: 'rs0' }) }) } };
  const mongos = { db: { admin: () => ({ command: async () => ({ ok: 1, msg: 'isdbgrid' }) }) } };
  await assert.doesNotReject(assertTransactionTopology(replicaSet));
  await assert.doesNotReject(assertTransactionTopology(mongos));
});
