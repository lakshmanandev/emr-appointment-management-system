import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export async function authenticate(req, _res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub).select('name email role doctor isActive');
    if (!user?.isActive) throw new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
    if (user.role === 'DOCTOR' && !user.doctor) throw new AppError(403, 'Doctor profile is not configured', 'FORBIDDEN');
    req.user = user;
    next();
  } catch (err) { next(err instanceof AppError ? err : new AppError(401, 'Invalid or expired access token', 'UNAUTHENTICATED')); }
}
export const allowRoles = (...roles) => (req, _res, next) => roles.includes(req.user?.role) ? next() : next(new AppError(403, 'You do not have permission to perform this action', 'FORBIDDEN'));
