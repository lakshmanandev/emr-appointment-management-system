import mongoose from 'mongoose';
const schema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, tokenHash: { type: String, required: true, select: false }, expiresAt: { type: Date, required: true, index: { expires: 0 } }, revokedAt: Date }, { timestamps: true });
export default mongoose.model('Session', schema);
