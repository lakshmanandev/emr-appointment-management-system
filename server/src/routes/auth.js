import { Router } from 'express';
import { loginSchema } from '../validators/auth.js';
import * as auth from '../services/authService.js';
import { ok } from '../utils/response.js';
const router = Router();
router.post('/login', async (req, res, next) => { try { const input = loginSchema.parse(req.body); ok(res, await auth.login(input.email, input.password, req, res)); } catch (e) { next(e); } });
router.post('/refresh', async (req, res, next) => { try { ok(res, await auth.refresh(req.cookies.refreshToken, res)); } catch (e) { next(e); } });
router.post('/logout', async (req, res, next) => { try { await auth.logout(req.cookies.refreshToken, res); ok(res, { message: 'Logged out' }); } catch (e) { next(e); } });
export default router;
