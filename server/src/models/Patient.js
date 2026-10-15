import mongoose from 'mongoose';
import { normalizePhone } from '../utils/phone.js';
const patientSchema = new mongoose.Schema({ patientId: { type: String, unique: true, required: true, uppercase: true, trim: true }, name: { type: String, required: true, trim: true, maxlength: 120 }, mobile: { type: String, required: true, trim: true, set: normalizePhone }, dateOfBirth: Date, gender: { type: String, enum: ['FEMALE', 'MALE', 'OTHER', 'PREFER_NOT_TO_SAY'] } }, { timestamps: true });
patientSchema.index({ mobile: 1 }); patientSchema.index({ name: 1 });
export default mongoose.model('Patient', patientSchema);
