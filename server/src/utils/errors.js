export class AppError extends Error {
  constructor(status, message, code = 'ERROR') { super(message); this.status = status; this.code = code; }
}
export const notFound = (message = 'Resource not found') => new AppError(404, message, 'NOT_FOUND');
export const conflict = (message = 'Resource conflicts with existing data') => new AppError(409, message, 'CONFLICT');
