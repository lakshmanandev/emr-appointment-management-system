import mongoose from 'mongoose';
const schema = new mongoose.Schema({ doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true }, dayOfWeek: { type: Number, min: 0, max: 6, required: true }, sessions: [{ start: { type: String, required: true }, end: { type: String, required: true }, slotMinutes: { type: Number, min: 5, max: 240, required: true }, breaks: [{ start: String, end: String }] }], timezone: { type: String, default: 'Asia/Kolkata' }, effectiveFrom: Date, effectiveTo: Date }, { timestamps: true });
schema.index({ doctor: 1, dayOfWeek: 1, effectiveFrom: 1, effectiveTo: 1 });
export default mongoose.model('DoctorSchedule', schema);
