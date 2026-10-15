import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';

const settingsSchema = z.object({
  language: z.enum(['en', 'ja', 'fa']).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
});

export function createSettingsRouter({ db, config }) {
  const router = Router();
  router.use(requireAuth({ secret: config.jwtSecret }));

  router.get('/', (req, res) => {
    res.json({ settings: db.getSettings(req.userId) });
  });

  router.put('/', (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    return res.json({ settings: db.updateSettings(req.userId, parsed.data) });
  });

  return router;
}
