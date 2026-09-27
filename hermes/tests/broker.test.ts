import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Agent,
  EmergencyStop,
  MemoryAuditSink,
  MockLlmProvider,
  REDACTED,
  ToolBroker,
  redact,
  toolDeclarations,
  visibleTools,
  type AgentEvent,
  type ConfirmationProvider,
  type ConfirmationRequest,
  type PermissionContext,
  type ToolExecutor,
  type ToolResult,
} from '@hermes/agent-protocol';

const SCOPE = 'C:/work';

class RecordingExecutor implements ToolExecutor {
  readonly calls: { tool: string; args: Record<string, unknown> }[] = [];
  aborted = false;

  constructor(private readonly behaviour: (tool: string) => ToolResult | Promise<ToolResult> = () => ({ ok: true, summary: 'done' })) {}

  async execute(tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
    this.calls.push({ tool, args });
    signal.addEventListener('abort', () => {
      this.aborted = true;
    });
    return this.behaviour(tool);
  }
}

function always(approved: boolean): ConfirmationProvider {
  return { request: async () => approved };
}

function makeBroker(options: {
  level?: PermissionContext['level'];
  executor?: ToolExecutor;
  confirmations?: ConfirmationProvider;
  stop?: EmergencyStop;
  scopes?: string[];
} = {}) {
  const audit = new MemoryAuditSink();
  const emergencyStop = options.stop ?? new EmergencyStop();
  const executor = options.executor ?? new RecordingExecutor();
  const broker = new ToolBroker({
    audit,
    emergencyStop,
    confirmations: options.confirmations ?? always(false),
    executor,
    getContext: () => ({
      level: options.level ?? 'ASSIST',
      toolAllowlist: [],
      toolDenylist: [],
      filesystemScopes: options.scopes ?? [SCOPE],
      emergencyStopActive: emergencyStop.isActive,
    }),
  });
  return { broker, audit, emergencyStop, executor: executor as RecordingExecutor };
}

describe('ToolBroker pipeline', () => {
  it('executes an allowed call and writes exactly one audit record', async () => {
    const { broker, audit, executor } = makeBroker();
    const outcome = await broker.invoke({ callId: 'c1', tool: 'computer.screenshot', args: {} }, 'run-1');

    expect(outcome.ok).toBe(true);
    expect(executor.calls).toHaveLength(1);
    expect(audit.all).toHaveLength(1);
    expect(audit.all[0]).toMatchObject({ tool: 'computer.screenshot', outcome: 'executed', runId: 'run-1' });
  });

  it('never reaches the executor when policy denies', async () => {
    const { broker, audit, executor } = makeBroker({ level: 'OBSERVE' });
    const outcome = await broker.invoke({ callId: 'c1', tool: 'shell.cmd', args: { command: 'dir' } });

    expect(outcome.ok).toBe(false);
    expect(executor.calls).toHaveLength(0);
    expect(audit.all[0]).toMatchObject({ outcome: 'deny', reason: 'level_forbids_capability' });
  });

  it('records the confirmation request and the decline separately', async () => {
    const { broker, audit, executor } = makeBroker({ confirmations: always(false) });
    const outcome = await broker.invoke({ callId: 'c1', tool: 'shell.cmd', args: { command: 'dir' } });

    expect(outcome.ok).toBe(false);
    expect(executor.calls).toHaveLength(0);
    expect(audit.all.map((r) => r.outcome)).toEqual(['confirm', 'deny']);
    expect(audit.all[1]).toMatchObject({ reason: 'user_declined' });
  });

  it('executes after approval', async () => {
    const { broker, audit, executor } = makeBroker({ confirmations: always(true) });
    const outcome = await broker.invoke({ callId: 'c1', tool: 'shell.cmd', args: { command: 'dir' } });

    expect(outcome.ok).toBe(true);
    expect(executor.calls).toHaveLength(1);
    expect(audit.all.map((r) => r.outcome)).toEqual(['confirm', 'executed']);
  });

  it('re-evaluates after approval so a grant cannot widen scope', async () => {
    // The user approves, but the path is outside every scope — the engine
    // still refuses, because approval is not a scope override.
    const { broker, executor } = makeBroker({ confirmations: always(true), scopes: [SCOPE] });
    const outcome = await broker.invoke({ callId: 'c1', tool: 'filesystem.delete', args: { path: 'D:/other/file.txt' } });

    expect(outcome.ok).toBe(false);
    expect(executor.calls).toHaveLength(0);
  });

  it('approval does not persist to a second identical call', async () => {
    let asked = 0;
    const confirmations: ConfirmationProvider = {
      request: async () => {
        asked += 1;
        return true;
      },
    };
    const { broker } = makeBroker({ confirmations });
    await broker.invoke({ callId: 'c1', tool: 'filesystem.delete', args: { path: `${SCOPE}/a.txt` } });
    await broker.invoke({ callId: 'c2', tool: 'filesystem.delete', args: { path: `${SCOPE}/b.txt` } });
    expect(asked).toBe(2);
  });

  it('treats a throwing confirmation provider as a refusal', async () => {
    const confirmations: ConfirmationProvider = {
      request: async () => {
        throw new Error('dialog closed');
      },
    };
    const { broker, executor } = makeBroker({ confirmations });
    const outcome = await broker.invoke({ callId: 'c1', tool: 'shell.cmd', args: { command: 'dir' } });
    expect(outcome.ok).toBe(false);
    expect(executor.calls).toHaveLength(0);
  });

  it('surfaces the confirmation request details to the UI', async () => {
    const seen: ConfirmationRequest[] = [];
    const confirmations: ConfirmationProvider = {
      request: async (req) => {
        seen.push(req);
        return false;
      },
    };
    const { broker } = makeBroker({ confirmations, level: 'AUTONOMOUS' });
    await broker.invoke({ callId: 'c1', tool: 'shell.cmd', args: { command: 'format C:' } });

    expect(seen[0]).toMatchObject({ tool: 'shell.cmd', risk: 'CRITICAL', reason: 'always_confirm', detail: 'destructive.disk' });
  });

  it('records executor failures without throwing', async () => {
    const executor = new RecordingExecutor(() => ({ ok: false, summary: 'failed', error: 'boom' }));
    const { broker, audit } = makeBroker({ executor });
    const outcome = await broker.invoke({ callId: 'c1', tool: 'computer.screenshot', args: {} });

    expect(outcome.ok).toBe(false);
    expect(audit.all[0]).toMatchObject({ outcome: 'failed' });
  });
});

describe('emergency stop', () => {
  it('blocks new calls once engaged', async () => {
    const stop = new EmergencyStop();
    const { broker, executor } = makeBroker({ stop });
    stop.trigger();

    const outcome = await broker.invoke({ callId: 'c1', tool: 'computer.screenshot', args: {} });
    expect(outcome.ok).toBe(false);
    expect(executor.calls).toHaveLength(0);
  });

  it('aborts an in-flight execution', async () => {
    const stop = new EmergencyStop();
    let observedAbort = false;
    const executor: ToolExecutor = {
      async execute(_tool, _args, signal) {
        await new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => {
            observedAbort = true;
            resolve();
          });
          setTimeout(resolve, 2000);
        });
        return { ok: !observedAbort, summary: observedAbort ? 'aborted' : 'finished' };
      },
    };
    const { broker } = makeBroker({ stop, executor });

    const pending = broker.invoke({ callId: 'c1', tool: 'computer.screenshot', args: {} });
    setTimeout(() => stop.trigger(), 20);
    const outcome = await pending;

    expect(observedAbort).toBe(true);
    expect(outcome.ok).toBe(false);
  });

  it('is idempotent and notifies listeners once', () => {
    const stop = new EmergencyStop();
    const listener = vi.fn();
    stop.onChange(listener);
    stop.trigger();
    stop.trigger();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(stop.isActive).toBe(true);
  });

  it('re-arms with a fresh signal after reset', () => {
    const stop = new EmergencyStop();
    const first = stop.signal;
    stop.trigger();
    stop.reset();
    expect(stop.isActive).toBe(false);
    expect(stop.signal).not.toBe(first);
    expect(stop.signal.aborted).toBe(false);
  });
});

describe('audit redaction', () => {
  it('redacts credential-shaped keys', () => {
    expect(redact({ password: 'hunter2', apiKey: 'x', nested: { token: 'y' } })).toEqual({
      password: REDACTED,
      apiKey: REDACTED,
      nested: { token: REDACTED },
    });
  });

  it('redacts credential-shaped values wherever they appear', () => {
    const out = redact({ command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrst"' }) as { command: string };
    expect(out.command).toContain(REDACTED);
    expect(out.command).not.toContain('abcdefghijklmnopqrst');
  });

  it('redacts provider keys and private keys', () => {
    expect(redact('sk-abcdefghijklmnopqrstuvwx')).toBe(REDACTED);
    expect(redact('ghp_abcdefghijklmnopqrstuvwxyz0123')).toBe(REDACTED);
    expect(redact('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----')).toBe(REDACTED);
  });

  it('truncates very long strings', () => {
    expect((redact('x'.repeat(10_000)) as string).length).toBeLessThan(4_100);
  });

  it('is applied by the broker before anything is persisted', async () => {
    const { broker, audit } = makeBroker({ level: 'AUTONOMOUS', confirmations: always(true) });
    await broker.invoke({
      callId: 'c1',
      tool: 'computer.keyboard_type',
      args: { text: 'my key is sk-abcdefghijklmnopqrstuvwx' },
    });
    const record = audit.all.at(-1)!;
    expect(JSON.stringify(record.args)).not.toContain('sk-abcdefghijklmnopqrstuvwx');
  });
});

describe('agent loop', () => {
  let events: AgentEvent[];

  beforeEach(() => {
    events = [];
  });

  function makeAgent(level: PermissionContext['level'] = 'OBSERVE', confirmations = always(false)) {
    const { broker, audit, emergencyStop, executor } = makeBroker({ level, confirmations });
    const agent = new Agent({
      provider: new MockLlmProvider(),
      broker,
      emergencyStop,
      emit: (event) => events.push(event),
    });
    const tools = new Set(visibleTools({ level, toolAllowlist: [], toolDenylist: [] }));
    return {
      agent,
      audit,
      emergencyStop,
      executor,
      availableTools: toolDeclarations().filter((t) => tools.has(t.name)),
    };
  }

  it('runs observe -> reason -> execute -> observe -> answer', async () => {
    const { agent, availableTools, executor } = makeAgent();
    const result = await agent.run({
      goal: 'take a screenshot please',
      systemPrompt: 'test',
      language: 'en',
      availableTools,
    });

    expect(result.interrupted).toBe(false);
    expect(executor.calls[0]?.tool).toBe('computer.screenshot');
    const types = events.map((e) => e.type);
    expect(types).toContain('started');
    expect(types).toContain('thinking');
    expect(types).toContain('tool.started');
    expect(types).toContain('tool.completed');
    expect(types).toContain('completed');
  });

  it('only advertises tools the level permits', () => {
    const { availableTools } = makeAgent('OBSERVE');
    expect(availableTools.map((t) => t.name)).not.toContain('shell.powershell');
    expect(availableTools.map((t) => t.name)).toContain('computer.screenshot');
  });

  it('continues after a denied tool instead of crashing', async () => {
    const { agent, availableTools } = makeAgent('OBSERVE');
    const result = await agent.run({
      goal: 'delete my temp files',
      systemPrompt: 'test',
      language: 'en',
      availableTools,
    });
    const completed = events.find((e) => e.type === 'tool.completed');
    expect(completed).toBeDefined();
    expect(result.interrupted).toBe(false);
  });

  it('verifies state-changing actions with a follow-up observation', async () => {
    // A provider that types once, then finishes. Typing changes machine state,
    // so the loop must re-observe with a screenshot before answering.
    let step = 0;
    const provider = {
      id: 'typer',
      complete: async () => {
        step += 1;
        return step === 1
          ? { kind: 'tool' as const, thought: 'typing', calls: [{ callId: 'k1', tool: 'computer.keyboard_type', args: { text: 'hi' } }] }
          : { kind: 'final' as const, text: 'done', emotion: 'neutral' as const };
      },
    };
    const { broker, emergencyStop, executor } = makeBroker({ level: 'AUTONOMOUS' });
    const agent = new Agent({ provider, broker, emergencyStop, emit: (e) => events.push(e) });
    await agent.run({ goal: 'type hi', systemPrompt: 'test', language: 'en', availableTools: toolDeclarations() });

    expect(executor.calls.map((c) => c.tool)).toEqual(['computer.keyboard_type', 'computer.screenshot']);
    expect(events.some((e) => e.type === 'verifying' && e.callId === 'k1')).toBe(true);
  });

  it('does not re-observe after a read-only action', async () => {
    let step = 0;
    const provider = {
      id: 'reader',
      complete: async () => {
        step += 1;
        return step === 1
          ? { kind: 'tool' as const, thought: 'looking', calls: [{ callId: 's1', tool: 'system.info', args: {} }] }
          : { kind: 'final' as const, text: 'done', emotion: 'neutral' as const };
      },
    };
    const { broker, emergencyStop, executor } = makeBroker({ level: 'OBSERVE' });
    const agent = new Agent({ provider, broker, emergencyStop, emit: (e) => events.push(e) });
    await agent.run({ goal: 'system info', systemPrompt: 'test', language: 'en', availableTools: toolDeclarations() });

    expect(executor.calls.map((c) => c.tool)).toEqual(['system.info']);
  });

  it('stops immediately when the emergency stop fires mid-run', async () => {
    const { agent, availableTools, emergencyStop } = makeAgent();
    emergencyStop.trigger();
    const result = await agent.run({ goal: 'take a screenshot', systemPrompt: 'test', language: 'en', availableTools });
    expect(result.interrupted).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'interrupted', reason: 'emergency_stop' });
  });

  it('gives up after maxIterations rather than looping forever', async () => {
    const provider = {
      id: 'loop',
      complete: async () => ({
        kind: 'tool' as const,
        thought: 'again',
        calls: [{ callId: `c${Math.random()}`, tool: 'computer.screenshot', args: {} }],
      }),
    };
    const { broker, emergencyStop } = makeBroker();
    const agent = new Agent({ provider, broker, emergencyStop, emit: (e) => events.push(e) });
    const result = await agent.run({
      goal: 'loop',
      systemPrompt: 'test',
      language: 'en',
      availableTools: toolDeclarations(),
      maxIterations: 3,
    });
    expect(result.interrupted).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: 'interrupted', reason: 'max_iterations' });
  });
});
