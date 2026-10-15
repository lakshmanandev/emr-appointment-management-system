import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { env } from './config/env.js';
import User from './models/User.js';
try {
  const email = process.env.SEED_ADMIN_EMAIL; const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (at least 12 characters) in the environment before seeding.');
  await mongoose.connect(env.MONGODB_URI);
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) throw new Error('A user with SEED_ADMIN_EMAIL already exists; seed does not overwrite users.');
  await User.create({ name: 'System Administrator', email, passwordHash: await bcrypt.hash(password, 12), role: 'SUPER_ADMIN' });
  console.info(`Seeded administrator ${email}.`);
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { await mongoose.disconnect(); }
