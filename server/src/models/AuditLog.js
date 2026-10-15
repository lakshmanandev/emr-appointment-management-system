import mongoose from 'mongoose';
const schema = new mongoose.Schema({ actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, actorRole: String, operationId: { type: mongoose.Schema.Types.ObjectId, unique: true, sparse: true }, action: { type: String, required: true }, entityType: { type: String, required: true }, entityId: mongoose.Schema.Types.ObjectId, metadata: mongoose.Schema.Types.Mixed }, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ entityType: 1, entityId: 1, createdAt: -1 }); schema.index({ actor: 1, createdAt: -1 });
export default mongoose.model('AuditLog', schema);
