import { createApp } from '../src/app.js';

/** Start an isolated app instance on an ephemeral port with an in-memory database. */
export async function startTestServer(overrides = {}) {
  const { app, db, config, provider, registry } = createApp({
    config: { dbPath: ':memory:', jwtSecret: 'test-secret', ...(overrides.config || {}) },
    provider: overrides.provider,
    registry: overrides.registry,
    ...overrides,
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    db,
    config,
    provider,
    registry,
    async close() {
      // fetch() keeps sockets alive; close them so the server can shut down.
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
    request(path, { method = 'GET', token, body, headers = {} } = {}) {
      return fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
  };
}

export async function registerUser(server, email = 'user@example.com', password = 'password123') {
  const response = await server.request('/api/auth/register', {
    method: 'POST',
    body: { email, name: email.split('@')[0], password },
  });
  const payload = await response.json();
  if (response.status !== 201) throw new Error(`registration failed: ${JSON.stringify(payload)}`);
  return payload;
}

export function deterministicProvider(chunks) {
  return {
    id: 'test-provider',
    isMock: true,
    async *streamChat() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

/** Read an SSE response body into a list of { event, data } records. */
export async function readSse(response) {
  const text = await response.text();
  return text
    .split('\n\n')
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      const event = /^event: (.*)$/m.exec(block)?.[1] || 'message';
      const dataLine = /^data: (.*)$/m.exec(block)?.[1] || '{}';
      return { event, data: JSON.parse(dataLine) };
    });
}
