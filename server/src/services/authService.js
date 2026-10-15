import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const digest = (token) => crypto.createHash('sha256').update(token).digest('hex');
const signAccess = (user) => jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', expiresIn: env.ACCESS_TOKEN_TTL });
const signRefresh = (user) => jwt.sign({ sub: user.id, nonce: crypto.randomUUID() }, env.JWT_REFRESH_SECRET, { algorithm: 'HS256', expiresIn: `${env.REFRESH_TOKEN_DAYS}d` });
const cookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: env.COOKIE_SAME_SITE, path: '/api/v1/auth' };

export async function login(email, password, req, res) {
  const user = await User.findOne({ email: email.toLowerCase(), isActive: true }).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await AuditLog.create({ actor: user?._id, actorRole: user?.role, action: 'AUTH_LOGIN_FAILED', entityType: 'User', metadata: { email: email.toLowerCase(), ip: req.ip } });
    throw new AppError(401, 'Email or password is incorrect', 'INVALID_CREDENTIALS');
  }
  const refresh = signRefresh(user);
  user.refreshTokenHash = digest(refresh);
  user.refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000);
  await user.save();
  await AuditLog.create({ actor: user._id, actorRole: user.role, action: 'AUTH_LOGIN', entityType: 'User', entityId: user._id });
  res.cookie('refreshToken', refresh, { ...cookieOptions, maxAge: env.REFRESH_TOKEN_DAYS * 86400000 });
  return { accessToken: signAccess(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, doctor: user.doctor } };
}

export async function refresh(raw, res) {
  if (!raw) throw new AppError(401, 'Refresh token required', 'UNAUTHENTICATED');
  let payload;
  try { payload = jwt.verify(raw, env.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }); } catch { throw new AppError(401, 'Invalid refresh token', 'UNAUTHENTICATED'); }
  const user = await User.findById(payload.sub).select('+refreshTokenHash');
  if (!user?.isActive || !user.refreshTokenHash || !crypto.timingSafeEqual(Buffer.from(digest(raw)), Buffer.from(user.refreshTokenHash)) || user.refreshExpiresAt < new Date()) throw new AppError(401, 'Refresh session expired', 'UNAUTHENTICATED');
  const next = signRefresh(user);
  const rotated = await User.findOneAndUpdate({ _id: user._id, refreshTokenHash: digest(raw), refreshExpiresAt: { $gt: new Date() }, isActive: true }, { $set: { refreshTokenHash: digest(next), refreshExpiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000) } }, { new: true }).select('name email role doctor isActive');
  if (!rotated) throw new AppError(401, 'Refresh session has already been rotated', 'UNAUTHENTICATED');
  res.cookie('refreshToken', next, { ...cookieOptions, maxAge: env.REFRESH_TOKEN_DAYS * 86400000 });
  return { accessToken: signAccess(rotated), user: { id: rotated.id, name: rotated.name, email: rotated.email, role: rotated.role, doctor: rotated.doctor } };
}
export async function logout(raw, res) {
  try { const p = jwt.verify(raw || '', env.JWT_REFRESH_SECRET); await User.updateOne({ _id: p.sub, refreshTokenHash: digest(raw) }, { $unset: { refreshTokenHash: 1, refreshExpiresAt: 1 } }); } catch { /* invalid or already expired sessions still clear the browser cookie */ }
  res.clearCookie('refreshToken', cookieOptions);
}
