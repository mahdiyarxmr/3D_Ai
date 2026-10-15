import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { startTestServer, registerUser, readSse, deterministicProvider } from './helpers.js';

/**
 * Multi-user isolation: one account must never be able to read, modify or
 * delete another account's data.
 */
describe('LunaAI Web multi-user isolation', () => {
  let server;
  let alice;
  let bob;

  before(async () => {
    server = await startTestServer();
    alice = await registerUser(server, 'alice@example.com');
    bob = await registerUser(server, 'bob@example.com');
  });

  after(async () => {
    await server.close();
  });

  it('lists only the requesting user\'s conversations', async () => {
    await server.request('/api/conversations', { method: 'POST', token: alice.token, body: { title: 'Alice secret' } });
    await server.request('/api/conversations', { method: 'POST', token: bob.token, body: { title: 'Bob secret' } });

    const aliceList = await (await server.request('/api/conversations', { token: alice.token })).json();
    const bobList = await (await server.request('/api/conversations', { token: bob.token })).json();

    assert.equal(aliceList.conversations.length, 1);
    assert.equal(aliceList.conversations[0].title, 'Alice secret');
    assert.equal(bobList.conversations[0].title, 'Bob secret');
    assert.ok(!JSON.stringify(aliceList).includes('Bob secret'));
  });

  it('returns 404 (not 403) when reading another user\'s conversation', async () => {
    const bobConvo = (await (await server.request('/api/conversations', { token: bob.token })).json()).conversations[0];

    const read = await server.request(`/api/conversations/${bobConvo.id}`, { token: alice.token });
    assert.equal(read.status, 404);

    const readMessages = await server.request(`/api/conversations/${bobConvo.id}/messages`, {
      method: 'POST',
      token: alice.token,
      body: { content: 'leak attempt' },
    });
    assert.equal(readMessages.status, 404);
  });

  it('cannot delete or rename another user\'s conversation', async () => {
    const bobConvo = (await (await server.request('/api/conversations', { token: bob.token })).json()).conversations[0];

    const del = await server.request(`/api/conversations/${bobConvo.id}`, { method: 'DELETE', token: alice.token });
    assert.equal(del.status, 404);

    const rename = await server.request(`/api/conversations/${bobConvo.id}`, {
      method: 'PATCH',
      token: alice.token,
      body: { title: 'hijacked' },
    });
    assert.equal(rename.status, 404);

    const bobView = await (await server.request(`/api/conversations/${bobConvo.id}`, { token: bob.token })).json();
    assert.equal(bobView.conversation.title, 'Bob secret');
  });

  it('scopes message search to the requesting user', async () => {
    const conversation = (await (await server.request('/api/conversations', { method: 'POST', token: alice.token, body: { title: 'Search' } })).json()).conversation;
    await server.request(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      token: alice.token,
      body: { content: 'the hidden keyword is pineapple' },
    });

    const aliceSearch = await (await server.request('/api/conversations/search?q=pineapple', { token: alice.token })).json();
    const bobSearch = await (await server.request('/api/conversations/search?q=pineapple', { token: bob.token })).json();

    assert.ok(aliceSearch.results.length >= 1);
    assert.ok(aliceSearch.results.every((result) => result.id === conversation.id));
    assert.equal(bobSearch.results.length, 0);
  });

  it('persists user settings per account', async () => {
    await server.request('/api/settings', { method: 'PUT', token: alice.token, body: { language: 'fa' } });
    await server.request('/api/settings', { method: 'PUT', token: bob.token, body: { language: 'ja' } });

    const aliceSettings = await (await server.request('/api/settings', { token: alice.token })).json();
    const bobSettings = await (await server.request('/api/settings', { token: bob.token })).json();

    assert.equal(aliceSettings.settings.language, 'fa');
    assert.equal(bobSettings.settings.language, 'ja');
  });

  it('persists conversations and messages across a server restart', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'lunaai-web-'));
    const dbPath = path.join(dir, 'restart.db');
    const provider = deterministicProvider([{ type: 'text', text: 'stored reply' }]);

    const first = await startTestServer({ config: { dbPath }, provider });
    const user = await registerUser(first, 'persist@example.com');
    const conversation = (
      await (await first.request('/api/conversations', { method: 'POST', token: user.token, body: { title: 'Persisted' } })).json()
    ).conversation;
    const stream = await first.request(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      token: user.token,
      body: { content: 'remember me' },
    });
    await readSse(stream);
    await first.close();

    const second = await startTestServer({ config: { dbPath }, provider });
    try {
      const login = await (
        await second.request('/api/auth/login', {
          method: 'POST',
          body: { email: 'persist@example.com', password: 'password123' },
        })
      ).json();
      assert.ok(login.token, 'account survived restart');

      const reloaded = await (
        await second.request(`/api/conversations/${conversation.id}`, { token: login.token })
      ).json();
      assert.equal(reloaded.conversation.title, 'Persisted');
      assert.deepEqual(
        reloaded.messages.map((m) => [m.role, m.content]),
        [
          ['user', 'remember me'],
          ['assistant', 'stored reply'],
        ]
      );
    } finally {
      await second.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
