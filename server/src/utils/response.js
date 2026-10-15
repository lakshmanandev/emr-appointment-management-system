export const ok = (res, data, status = 200, extra = {}) => res.status(status).json({ success: true, data, ...extra });
