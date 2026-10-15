import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth.js';
import { authorizeToolInvocation, parseToolArguments } from '../tools/policy.js';

const messageSchema = z.object({ content: z.string().min(1).max(32_000) });
const renameSchema = z.object({ title: z.string().trim().max(200) });

export function createConversationRouter({ db, config, provider, registry }) {
  const router = Router();
  router.use(requireAuth({ secret: config.jwtSecret }));

  router.get('/', (req, res) => {
    res.json({ conversations: db.listConversations(req.userId) });
  });

  router.get('/search', (req, res) => {
    const query = String(req.query.q || '').trim();
    if (query.length < 2) return res.json({ results: [] });
    return res.json({ results: db.searchConversations(req.userId, query.slice(0, 100)) });
  });

  router.post('/', (req, res) => {
    const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 200) : '';
    const conversation = db.createConversation(req.userId, title);
    res.status(201).json({ conversation });
  });

  router.get('/:id', (req, res) => {
    const conversation = db.getConversation(req.userId, Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: 'not_found' });
    return res.json({
      conversation: { ...conversation, user_id: undefined },
      messages: db.listMessages(conversation.id),
    });
  });

  router.patch('/:id', (req, res) => {
    const parsed = renameSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });
    const ok = db.renameConversation(req.userId, Number(req.params.id), parsed.data.title);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    return res.json({ conversation: db.getConversation(req.userId, Number(req.params.id)) });
  });

  router.delete('/:id', (req, res) => {
    const ok = db.deleteConversation(req.userId, Number(req.params.id));
    if (!ok) return res.status(404).json({ error: 'not_found' });
    return res.status(204).end();
  });

  router.post('/:id/messages', async (req, res, next) => {
    const conversation = db.getConversation(req.userId, Number(req.params.id));
    if (!conversation) return res.status(404).json({ error: 'not_found' });

    const parsed = messageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'invalid_input' });

    db.addMessage(conversation.id, 'user', parsed.data.content);
    if (!conversation.title) {
      db.renameConversation(req.userId, conversation.id, parsed.data.content.slice(0, 60));
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const controller = new AbortController();
    let clientClosed = false;
    // res 'close' fires when the client disconnects *and* when the response has
    // finished, so only treat it as a cancellation while streaming is ongoing.
    res.on('close', () => {
      if (!res.writableEnded) {
        clientClosed = true;
        controller.abort();
      }
    });

    const send = (event, data) => {
      if (clientClosed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const history = db.listMessages(conversation.id).map(({ role, content }) => ({ role, content }));
      const toolDefinitions = registry.definitions(config.tools.allowlist);

      let assistantText = '';
      let rounds = 0;

      while (rounds < config.tools.maxRounds) {
        rounds += 1;
        const pendingToolCalls = new Map();

        for await (const chunk of provider.streamChat({
          messages: history,
          tools: config.tools.enabled && toolDefinitions.length ? toolDefinitions : undefined,
          signal: controller.signal,
        })) {
          if (chunk.type === 'text') {
            assistantText += chunk.text;
            send('delta', { text: chunk.text });
          } else if (chunk.type === 'tool_calls') {
            for (const call of chunk.toolCalls) {
              const index = call.index ?? 0;
              const existing = pendingToolCalls.get(index) || { id: '', function: { name: '', arguments: '' } };
              if (call.id) existing.id = call.id;
              if (call.function?.name) existing.function.name += call.function.name;
              if (call.function?.arguments) existing.function.arguments += call.function.arguments;
              pendingToolCalls.set(index, existing);
            }
          }
        }

        if (pendingToolCalls.size === 0) break;

        const calls = [...pendingToolCalls.values()];
        history.push({
          role: 'assistant',
          content: assistantText || null,
          tool_calls: calls.map((c) => ({
            id: c.id || `call_${rounds}`,
            type: 'function',
            function: c.function,
          })),
        });

        for (const call of calls) {
          const decision = authorizeToolInvocation({ registry, toolCall: call, config });
          if (!decision.allowed) {
            db.recordAudit({
              userId: req.userId,
              kind: 'tool.denied',
              detail: `${call.function?.name || 'unknown'}:${decision.reason}`,
            });
            send('tool', { name: call.function?.name, status: 'denied', reason: decision.reason });
            history.push({
              role: 'tool',
              tool_call_id: call.id || `call_${rounds}`,
              content: JSON.stringify({ error: decision.reason }),
            });
            continue;
          }

          try {
            const args = parseToolArguments(call);
            const result = await decision.tool.handler(args);
            db.recordAudit({
              userId: req.userId,
              kind: 'tool.executed',
              detail: decision.tool.name,
            });
            send('tool', { name: decision.tool.name, status: 'ok', result });
            history.push({
              role: 'tool',
              tool_call_id: call.id || `call_${rounds}`,
              content: JSON.stringify(result),
            });
          } catch (error) {
            send('tool', { name: decision.tool.name, status: 'error', reason: error.message });
            history.push({
              role: 'tool',
              tool_call_id: call.id || `call_${rounds}`,
              content: JSON.stringify({ error: error.message }),
            });
          }
        }
      }

      if (assistantText) {
        db.addMessage(conversation.id, 'assistant', assistantText);
      }
      send('done', { content: assistantText, aborted: clientClosed });
      res.end();
    } catch (error) {
      if (!clientClosed) {
        send('error', { error: 'provider_error' });
        res.end();
      }
      if (!clientClosed) return next(error);
      return undefined;
    }

    return undefined;
  });

  return router;
}
