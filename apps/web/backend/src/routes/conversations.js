import { Router } from 'express';
import { z } from 'zod';
import * as db from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (req, res) => {
  res.json({ conversations: db.listConversations(req.userId) });
});

router.post('/', (req, res) => {
  const schema = z.object({ title: z.string().max(120).optional() });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const id = db.createConversation(req.userId, parsed.data.title || 'New conversation');
  res.status(201).json({ conversation: db.getConversation(req.userId, id) });
});

router.get('/:id', (req, res) => {
  const conv = db.getConversation(req.userId, Number(req.params.id));
  if (!conv) return res.status(404).json({ error: 'not_found' });
  res.json({ conversation: conv, messages: db.listMessages(conv.id) });
});

router.delete('/:id', (req, res) => {
  const ok = db.deleteConversation(req.userId, Number(req.params.id));
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.status(204).end();
});

router.post('/:id/messages', async (req, res) => {
  const conv = db.getConversation(req.userId, Number(req.params.id));
  if (!conv) return res.status(404).json({ error: 'not_found' });
  const schema = z.object({ content: z.string().min(1).max(8000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
  const userContent = parsed.data.content;
  db.addMessage(conv.id, 'user', userContent);

  // SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const history = db.listMessages(conv.id);
    const provider = await import('../providers/index.js');
    let assistantText = '';
    for await (const chunk of provider.streamChat(history)) {
      assistantText += chunk;
      send('chunk', { text: chunk });
    }
    db.addMessage(conv.id, 'assistant', assistantText);
    send('done', { message: assistantText });
  } catch (err) {
    send('error', { message: err.message || 'provider_error' });
  } finally {
    res.end();
  }
});

export default router;
