import mongoose from 'mongoose';
const schema = new mongoose.Schema({ doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true }, startAt: { type: Date, required: true }, endAt: { type: Date, required: true }, appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true } }, { timestamps: true });
schema.index({ doctor: 1, startAt: 1 }, { unique: true });
export default mongoose.model('SlotReservation', schema);
