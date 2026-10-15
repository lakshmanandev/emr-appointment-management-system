import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Load the repository-level .env regardless of whether this workspace is
// started from the repository root or from server/.
const configDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(configDirectory, '../../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  LOGIN_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/emr_appointments'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  COOKIE_SECURE: z.string().default('false').transform((v) => v === 'true'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  APP_TIMEZONE: z.string().default('Asia/Kolkata'),
});

export const env = schema.parse(process.env);
new Intl.DateTimeFormat('en-US', { timeZone: env.APP_TIMEZONE });
if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) throw new Error('COOKIE_SECURE=true is required when COOKIE_SAME_SITE=none');
if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) throw new Error('COOKIE_SECURE=true is required in production');
