import mongoose from 'mongoose';
const departmentSchema = new mongoose.Schema({ name: { type: String, required: true, trim: true, unique: true }, description: { type: String, trim: true, maxlength: 500 }, isActive: { type: Boolean, default: true } }, { timestamps: true });
export default mongoose.model('Department', departmentSchema);
