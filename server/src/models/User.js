import mongoose from 'mongoose';
export const ROLES = ['SUPER_ADMIN', 'RECEPTIONIST', 'DOCTOR'];
const userSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true, maxlength: 120 }, email: { type: String, required: true, unique: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true, select: false }, role: { type: String, enum: ROLES, required: true }, doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }, refreshTokenHash: { type: String, select: false }, refreshExpiresAt: Date, isActive: { type: Boolean, default: true } }, { timestamps: true });
export default mongoose.model('User', userSchema);
