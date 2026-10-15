import AuditLog from '../models/AuditLog.js';
export const audit = (user, action, entityType, entityId, metadata = {}, operationId, session) => {
  const event = { actor: user?._id, actorRole: user?.role, action, entityType, entityId, metadata, ...(operationId ? { operationId } : {}) };
  const query = operationId ? AuditLog.updateOne({ operationId }, { $setOnInsert: event }, { upsert: true }) : AuditLog.create(event);
  return session ? query.session(session) : query;
};
