import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer, registerUser } from './helpers.js';

describe('LunaAI Web auth', () => {
  let server;

  before(async () => {
    server = await startTestServer();
  });

  after(async () => {
    await server.close();
  });

  it('registers a user and returns a token without exposing the password hash', async () => {
    const response = await server.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'Alice@Example.com', name: 'Alice', password: 'password123' },
    });
    const payload = await response.json();

    assert.equal(response.status, 201);
    assert.ok(payload.token);
    assert.equal(payload.user.email, 'alice@example.com');
    assert.equal(payload.user.name, 'Alice');
    assert.equal(payload.user.password_hash, undefined);
    assert.equal(payload.user.passwordHash, undefined);
  });

  it('rejects weak passwords and malformed input', async () => {
    const short = await server.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'short@example.com', name: 'Short', password: 'abc' },
    });
    assert.equal(short.status, 400);

    const badEmail = await server.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'not-an-email', name: 'Bad', password: 'password123' },
    });
    assert.equal(badEmail.status, 400);
  });

  it('rejects duplicate accounts case-insensitively', async () => {
    await registerUser(server, 'dupe@example.com');
    const again = await server.request('/api/auth/register', {
      method: 'POST',
      body: { email: 'DUPE@example.com', name: 'Dupe', password: 'password123' },
    });
    assert.equal(again.status, 409);
    assert.deepEqual(await again.json(), { error: 'email_taken' });
  });

  it('logs in with valid credentials and rejects invalid ones', async () => {
    await registerUser(server, 'login@example.com', 'password123');

    const ok = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'login@example.com', password: 'password123' },
    });
    assert.equal(ok.status, 200);
    assert.ok((await ok.json()).token);

    const wrong = await server.request('/api/auth/login', {
      method: 'POST',
      body: { email: 'login@example.com', password: 'wrong-password' },
    });
    assert.equal(wrong.status, 401);
  });

  it('stores passwords as bcrypt hashes, not plaintext', async () => {
    await registerUser(server, 'hashed@example.com', 'password123');
    const row = server.db.findUserByEmail('hashed@example.com');
    assert.match(row.password_hash, /^\$2[aby]\$/);
    assert.ok(!row.password_hash.includes('password123'));
  });

  it('requires a valid bearer token on protected endpoints', async () => {
    const anonymous = await server.request('/api/conversations');
    assert.equal(anonymous.status, 401);

    const forged = await server.request('/api/conversations', { token: 'not.a.token' });
    assert.equal(forged.status, 401);
  });

  it('rate-limits repeated authentication attempts', async () => {
    const limited = await startTestServer({ config: { rateLimit: { windowMs: 60_000, globalMax: 1000, authMax: 3 } } });
    try {
      const statuses = [];
      for (let i = 0; i < 5; i += 1) {
        const response = await limited.request('/api/auth/login', {
          method: 'POST',
          body: { email: 'nobody@example.com', password: 'password123' },
        });
        statuses.push(response.status);
      }
      assert.equal(statuses.at(-1), 429);
      assert.ok(statuses.includes(401));
    } finally {
      await limited.close();
    }
  });
});
