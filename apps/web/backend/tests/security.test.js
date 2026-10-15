import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { startTestServer, registerUser, readSse, deterministicProvider } from './helpers.js';
import { ToolRegistry, EXECUTION_SCOPE } from '../src/tools/registry.js';
import { createDefaultRegistry, evaluateArithmetic } from '../src/tools/serverTools.js';
import { authorizeToolInvocation } from '../src/tools/policy.js';

describe('LunaAI Web server tool policy', () => {
  it('refuses to register local-computer capabilities', () => {
    const registry = new ToolRegistry();
    const attempts = [
      { name: 'shell_exec', handler: async () => ({}) },
      { name: 'filesystem_read', handler: async () => ({}) },
      { name: 'mouse_click', handler: async () => ({}) },
      { name: 'screenshot', handler: async () => ({}) },
      { name: 'powershell', handler: async () => ({}) },
    ];
    for (const attempt of attempts) {
      assert.throws(
        () => registry.register({ ...attempt, scope: EXECUTION_SCOPE.SERVER, description: 'x', parameters: {} }),
        /tool_capability_forbidden/
      );
    }
  });

  it('refuses tools that are not server-scoped', () => {
    const registry = new ToolRegistry();
    assert.throws(
      () => registry.register({ name: 'safe', scope: 'local', description: 'x', parameters: {}, handler: async () => ({}) }),
      /tool_scope_not_allowed/
    );
  });

  it('denies tool execution when server tools are disabled', () => {
    const registry = createDefaultRegistry();
    const decision = authorizeToolInvocation({
      registry,
      toolCall: { function: { name: 'calculate', arguments: '{"expression":"1+1"}' } },
      config: { tools: { enabled: false, allowlist: [] } },
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reason, 'server_tools_disabled');
  });

  it('denies unknown tools and tools outside the allowlist', () => {
    const registry = createDefaultRegistry();
    const unknown = authorizeToolInvocation({
      registry,
      toolCall: { function: { name: 'run_local_command', arguments: '{}' } },
      config: { tools: { enabled: true, allowlist: [] } },
    });
    assert.equal(unknown.allowed, false);
    assert.equal(unknown.reason, 'unknown_tool');

    const notAllowlisted = authorizeToolInvocation({
      registry,
      toolCall: { function: { name: 'calculate', arguments: '{}' } },
      config: { tools: { enabled: true, allowlist: ['server_time'] } },
    });
    assert.equal(notAllowlisted.allowed, false);
    assert.equal(notAllowlisted.reason, 'tool_not_allowlisted');
  });

  it('allows allowlisted server tools and evaluates arithmetic safely', () => {
    const registry = createDefaultRegistry();
    const decision = authorizeToolInvocation({
      registry,
      toolCall: { function: { name: 'calculate', arguments: '{"expression":"2 * (3 + 4)"}' } },
      config: { tools: { enabled: true, allowlist: ['calculate'] } },
    });
    assert.equal(decision.allowed, true);

    assert.equal(evaluateArithmetic('2 * (3 + 4)'), 14);
    assert.equal(evaluateArithmetic('-4 + 10 / 2'), 1);
    for (const malicious of ['process.exit()', 'require("fs")', '1; console.log(2)', '__import__("os")']) {
      assert.throws(() => evaluateArithmetic(malicious), /invalid_expression/);
    }
  });
});

describe('LunaAI Web tool execution over HTTP', () => {
  let server;

  before(async () => {
    server = await startTestServer({
      config: { tools: { enabled: true, allowlist: ['calculate'], maxRounds: 2 } },
      provider: deterministicProvider([
        {
          type: 'tool_calls',
          toolCalls: [{ index: 0, id: 'call_1', function: { name: 'calculate', arguments: '{"expression":"6*7"}' } }],
        },
        { type: 'text', text: 'The answer is 42.' },
      ]),
    });
  });

  after(async () => {
    await server.close();
  });

  it('executes an allowlisted tool and streams the result', async () => {
    const user = await registerUser(server, 'tools@example.com');
    const conversation = (
      await (await server.request('/api/conversations', { method: 'POST', token: user.token, body: {} })).json()
    ).conversation;

    const response = await server.request(`/api/conversations/${conversation.id}/messages`, {
      method: 'POST',
      token: user.token,
      body: { content: 'what is 6*7?' },
    });
    const events = await readSse(response);

    const toolEvent = events.find((event) => event.event === 'tool');
    assert.equal(toolEvent.data.name, 'calculate');
    assert.equal(toolEvent.data.status, 'ok');
    assert.equal(toolEvent.data.result.result, 42);
    assert.equal(events.at(-1).event, 'done');
  });

  it('records an audit event for every tool execution decision', async () => {
    const user = await registerUser(server, 'audit@example.com');
    const conversation = (
      await (await server.request('/api/conversations', { method: 'POST', token: user.token, body: {} })).json()
    ).conversation;
    await readSse(
      await server.request(`/api/conversations/${conversation.id}/messages`, {
        method: 'POST',
        token: user.token,
        body: { content: 'compute' },
      })
    );

    const events = server.db.db
      .prepare('SELECT kind, user_id FROM audit_events WHERE user_id = ? ORDER BY id')
      .all(user.user.id);
    assert.ok(events.some((event) => event.kind === 'tool.executed'));
  });

  it('exposes only server-scoped tools on the catalog endpoint', async () => {
    const user = await registerUser(server, 'catalog@example.com');
    const catalog = await (await server.request('/api/tools', { token: user.token })).json();

    assert.equal(catalog.scope, 'server');
    assert.deepEqual(catalog.tools.map((tool) => tool.name), ['server_time', 'calculate']);
    for (const tool of catalog.tools) {
      assert.equal(tool.scope, 'server');
    }
  });
});
