import { Router } from 'express';
import { z } from 'zod';
import * as db from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  res.json({ settings: db.getSettings(req.userId) });
});

router.put('/', (req, res) => {
  const schema = z.object({
    language: z.enum(['en','ja','fa']).optional(),
    theme: z.enum(['light','dark']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  db.updateSettings(req.userId, parsed.data.language, parsed.data.theme);
  res.json({ settings: db.getSettings(req.userId) });
});

export default router;
