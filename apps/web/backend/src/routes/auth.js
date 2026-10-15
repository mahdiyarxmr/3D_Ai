import { Router } from 'express';
import { z } from 'zod';
import * as db from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input', details: parsed.error.flatten() });
  const { email, name, password } = parsed.data;
  if (db.findUserByEmail(email)) return res.status(409).json({ error: 'email_taken' });
  const hash = await hashPassword(password);
  const id = db.createUser(email, name, hash);
  const user = db.findUserById(id);
  const token = signToken(user);
  res.status(201).json({ user, token });
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const { email, password } = parsed.data;
  const row = db.findUserByEmail(email);
  if (!row) return res.status(401).json({ error: 'invalid_credentials' });
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'invalid_credentials' });
  const user = db.findUserById(row.id);
  const token = signToken(user);
  res.json({ user, token });
});

export default router;
