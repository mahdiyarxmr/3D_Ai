import { Router } from 'express';
import { z } from 'zod';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js';

const registerSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(200),
  password: z.string().min(1).max(200),
});

export function createAuthRouter({ db, config, authLimiter }) {
  const router = Router();

  router.post('/register', authLimiter, async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
      const { email, name, password } = parsed.data;

      if (db.findUserByEmail(email)) return res.status(409).json({ error: 'email_taken' });

      const passwordHash = await hashPassword(password);
      const user = db.createUser({ email, name, passwordHash });
      db.recordAudit({ userId: user.id, kind: 'auth.register', detail: 'account created' });
      const token = signToken(user, { secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });
      return res.status(201).json({ user, token });
    } catch (error) {
      return next(error);
    }
  });

  router.post('/login', authLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
      const { email, password } = parsed.data;

      const row = db.findUserByEmail(email);
      if (!row) {
        db.recordAudit({ kind: 'auth.login_failed', detail: 'unknown account' });
        return res.status(401).json({ error: 'invalid_credentials' });
      }

      const ok = await verifyPassword(password, row.password_hash);
      if (!ok) {
        db.recordAudit({ userId: row.id, kind: 'auth.login_failed', detail: 'wrong password' });
        return res.status(401).json({ error: 'invalid_credentials' });
      }

      const user = db.findUserById(row.id);
      db.recordAudit({ userId: user.id, kind: 'auth.login', detail: 'ok' });
      const token = signToken(user, { secret: config.jwtSecret, expiresIn: config.jwtExpiresIn });
      return res.json({ user, token });
    } catch (error) {
      return next(error);
    }
  });

  router.get('/me', requireAuth({ secret: config.jwtSecret }), (req, res) => {
    const user = db.findUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'invalid_token' });
    return res.json({ user });
  });

  return router;
}
