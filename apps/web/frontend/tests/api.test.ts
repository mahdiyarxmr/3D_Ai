import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, LunaApiClient } from '../src/api';

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('LunaAI Web API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('attaches the bearer token only to authenticated calls', async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      return jsonResponse({ ok: true, product: 'LunaAI Web', apiVersion: 'v1', provider: 'echo', toolsEnabled: false });
    });

    const client = new LunaApiClient();
    client.setToken('token-123');
    await client.health();
    await client.listConversations();

    expect(calls[0].headers.authorization).toBeUndefined();
    expect(calls[1].headers.authorization).toBe('Bearer token-123');
    expect(calls[0].url).not.toContain('localhost');
    expect(calls[0].url).not.toContain('127.0.0.1');
  });

  it('maps HTTP errors to typed API errors and clears stale tokens', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'invalid_token' }, { status: 401 }));
    const client = new LunaApiClient();
    client.setToken('expired');

    await expect(client.listConversations()).rejects.toBeInstanceOf(ApiError);
    await expect(client.listConversations()).rejects.toMatchObject({ status: 401 });
    expect(client.getToken()).toBeNull();
  });

  it('reports network failures as a distinct error code', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('failed to fetch');
    });
    const client = new LunaApiClient();
    await expect(client.listConversations()).rejects.toMatchObject({ code: 'network', status: 0 });
  });

  it('streams deltas, tool notices and completion from the SSE endpoint', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"Hel"}\n\n'));
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"lo"}\n\n'));
        controller.enqueue(encoder.encode('event: tool\ndata: {"name":"calculate","status":"ok"}\n\n'));
        controller.enqueue(encoder.encode('event: done\ndata: {"content":"Hello"}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', async () => new Response(body, { status: 200 }));

    const client = new LunaApiClient();
    client.setToken('token');
    const deltas: string[] = [];
    const tools: string[] = [];
    await client.streamMessage(1, 'hi', {
      onDelta: (text) => deltas.push(text),
      onTool: (tool) => tools.push(`${tool.name}:${tool.status}`),
    });

    expect(deltas.join('')).toBe('Hello');
    expect(tools).toEqual(['calculate:ok']);
  });
});
