import { AppError } from '../utils/errors.js';

export function notFoundHandler(req, _res, next) { next(new AppError(404, `Route ${req.method} ${req.originalUrl} not found`, 'NOT_FOUND')); }
export function errorHandler(err, _req, res, _next) {
  if (err?.name === 'ZodError') return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
  if (err?.name === 'CastError') return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid resource identifier or value' } });
  if (err?.code === 11000) return res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'A record with these details already exists' } });
  const status = err instanceof AppError ? err.status : (err.status || 500);
  const message = status >= 500 ? 'An unexpected server error occurred' : err.message;
  if (status >= 500) reqLog(err);
  return res.status(status).json({ success: false, error: { code: err.code || 'INTERNAL_ERROR', message } });
}
function reqLog(err) { console.error(err); }
