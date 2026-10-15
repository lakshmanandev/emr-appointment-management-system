import mongoose from 'mongoose';
const doctorSchema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }, code: { type: String, required: true, unique: true, uppercase: true }, department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }, specialization: { type: String, required: true, trim: true }, schedule: [{ dayOfWeek: { type: Number, min: 0, max: 6, required: true }, sessions: [{ start: { type: String, required: true }, end: { type: String, required: true }, slotMinutes: { type: Number, min: 5, max: 240, required: true }, breaks: [{ start: String, end: String }] }] }], timezone: { type: String, default: 'Asia/Kolkata' }, scheduleRevision: { type: Number, default: 0, select: false }, isActive: { type: Boolean, default: true } }, { timestamps: true });
doctorSchema.index({ department: 1, isActive: 1 });
export default mongoose.model('Doctor', doctorSchema);

