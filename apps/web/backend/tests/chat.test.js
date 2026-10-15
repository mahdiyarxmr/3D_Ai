import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer, registerUser, readSse, deterministicProvider } from './helpers.js';
import { createApp } from '../src/app.js';

describe('LunaAI Web streaming chat', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      provider: deterministicProvider([{ type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }]),
    });
  });

  after(async () => {
    await server.close();
  });

  it('streams deltas and stores the assistant reply', async () => {
    const user = await registerUser(server, 'chat@example.com');
    const conversation = (
      await (await server.request('/api/conversations', { method: 'POST', token: user.token, body: {} })).json()
    ).conversation;

    const events = await readSse(
      await server.request(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        token: user.token,
        body: { content: 'hi there' },
      })
    );

    assert.deepEqual(
      events.filter((event) => event.event === 'delta').map((event) => event.data.text),
      ['Hello ', 'world']
    );
    const done = events.at(-1);
    assert.equal(done.event, 'done');
    assert.equal(done.data.content, 'Hello world');

    const view = await (await server.request(`/api/conversations/${conversation.id}`, { token: user.token })).json();
    assert.deepEqual(
      view.messages.map((m) => [m.role, m.content]),
      [
        ['user', 'hi there'],
        ['assistant', 'Hello world'],
      ]
    );
  });

  it('uses the first user message as the conversation title', async () => {
    const user = await registerUser(server, 'title@example.com');
    const conversation = (
      await (await server.request('/api/conversations', { method: 'POST', token: user.token, body: {} })).json()
    ).conversation;
    await readSse(
      await server.request(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        token: user.token,
        body: { content: 'Explain quantum tunnelling briefly' },
      })
    );

    const view = await (await server.request(`/api/conversations/${conversation.id}`, { token: user.token })).json();
    assert.equal(view.conversation.title, 'Explain quantum tunnelling briefly');
  });

  it('rejects empty and oversized messages', async () => {
    const user = await registerUser(server, 'limits@example.com');
    const conversation = (
      await (await server.request('/api/conversations', { method: 'POST', token: user.token, body: {} })).json()
    ).conversation;

    const empty = await server.request(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      token: user.token,
      body: { content: '' },
    });
    assert.equal(empty.status, 400);

    const oversized = await server.request(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      token: user.token,
      body: { content: 'x'.repeat(40_000) },
    });
    assert.equal(oversized.status, 400);
  });

  it('reports provider failures as an SSE error event instead of a crash', async () => {
    const failing = await startTestServer({
      provider: {
        id: 'failing',
        async *streamChat() {
          throw new Error('provider offline');
        },
      },
    });
    try {
      const user = await registerUser(failing, 'fail@example.com');
      const conversation = (
        await (await failing.request('/api/conversations', { method: 'POST', token: user.token, body: {} })).json()
      ).conversation;
      const events = await readSse(
        await failing.request(`/api/conversations/${conversation.id}/messages`, {
          method: 'POST',
          token: user.token,
          body: { content: 'hello?' },
        })
      );
      assert.ok(events.some((event) => event.event === 'error'));

      const health = await failing.request('/api/health');
      assert.equal(health.status, 200);
    } finally {
      await failing.close();
    }
  });

  it('never exposes provider secrets through API responses', async () => {
    const { app, db } = createApp({
      config: { dbPath: ':memory:', jwtSecret: 'test-secret', provider: { name: 'openai', apiKey: 'sk-super-secret', baseUrl: 'https://example.invalid', model: 'x' } },
      provider: deterministicProvider([{ type: 'text', text: 'ok' }]),
    });
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const health = await (await fetch(`${baseUrl}/api/health`)).text();
      assert.ok(!health.includes('sk-super-secret'));
      const toolCatalogResponse = await fetch(`${baseUrl}/api/tools`);
      const toolCatalog = await toolCatalogResponse.text();
      assert.ok(!toolCatalog.includes('sk-super-secret'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      db.close();
    }
  });
});
