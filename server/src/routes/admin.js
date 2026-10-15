import mongoose from 'mongoose';
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Doctor from '../models/Doctor.js';
import Department from '../models/Department.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { audit } from '../services/auditService.js';
import { inTransaction } from '../services/transactionService.js';
import { notFound } from '../utils/errors.js';
import { ok } from '../utils/response.js';

const router = Router(); router.use(authenticate, allowRoles('SUPER_ADMIN'));
const common = { name: z.string().trim().min(2).max(120), email: z.string().email().max(254), password: z.string().min(12).max(128) };
router.get('/doctors', async (_req, res, next) => { try { const data = await Doctor.find({ isActive: true }).select('code specialization department user timezone schedule').populate('department', 'name').populate('user', 'name email isActive').sort({ code: 1 }).limit(200).lean(); ok(res, data); } catch (e) { next(e); } });
router.get('/receptionists', async (_req, res, next) => { try { const data = await User.find({ role: 'RECEPTIONIST' }).select('name email isActive createdAt').sort({ name: 1 }).limit(200).lean(); ok(res, data); } catch (e) { next(e); } });
router.post('/receptionists', async (req, res, next) => {
  try {
    const input = z.object(common).parse(req.body); const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await inTransaction(async (session) => {
      const [user] = await User.create([{ name: input.name, email: input.email, passwordHash, role: 'RECEPTIONIST' }], { session });
      await audit(req.user, 'RECEPTIONIST_CREATED', 'User', user._id, {}, new mongoose.Types.ObjectId(), session);
      return { id: user.id, name: user.name, email: user.email, role: user.role };
    });
    ok(res, result, 201);
  } catch (e) { next(e); }
});
router.post('/doctors', async (req, res, next) => {
  try {
    const input = z.object({ ...common, code: z.string().trim().min(2).max(20), departmentId: z.string().regex(/^[a-f\d]{24}$/i), specialization: z.string().trim().min(2).max(100), timezone: z.string().default('Asia/Kolkata').refine((value) => { try { new Intl.DateTimeFormat('en-US', { timeZone: value }); return true; } catch { return false; } }, 'Invalid IANA timezone') }).parse(req.body);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const result = await inTransaction(async (session) => {
      if (!await Department.exists({ _id: input.departmentId, isActive: true }).session(session)) throw notFound('Department not found');
      const [user] = await User.create([{ name: input.name, email: input.email, passwordHash, role: 'DOCTOR' }], { session });
      const [doctor] = await Doctor.create([{ user: user._id, code: input.code, department: input.departmentId, specialization: input.specialization, timezone: input.timezone }], { session });
      user.doctor = doctor._id; await user.save({ session });
      await audit(req.user, 'DOCTOR_CREATED', 'Doctor', doctor._id, {}, new mongoose.Types.ObjectId(), session);
      return { id: doctor.id, user: { id: user.id, name: user.name, email: user.email }, code: doctor.code, department: doctor.department, specialization: doctor.specialization };
    });
    ok(res, result, 201);
  } catch (e) { next(e); }
});
router.post('/departments', async (req, res, next) => { try { const input = z.object({ name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).optional() }).parse(req.body); const department = await inTransaction(async (session) => { const [created] = await Department.create([input], { session }); await audit(req.user, 'DEPARTMENT_CREATED', 'Department', created._id, {}, new mongoose.Types.ObjectId(), session); return created; }); ok(res, department, 201); } catch (e) { next(e); } });
export default router;
