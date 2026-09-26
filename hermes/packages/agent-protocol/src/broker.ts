import { type AuditRecord, type AuditSink, redact } from './audit.js';
import { type Decision, type PermissionContext, evaluate } from './permissions.js';
import type { RiskLevel, ToolCall } from './tools.js';

/**
 * ToolBroker — the single path from agent to machine.
 *
 *   Agent -> parse -> Permission Manager -> Risk Check -> Confirmation
 *         -> Executor -> Audit Log -> Result -> Agent
 *
 * There is no other way to reach an executor: executors are registered here
 * and are never handed to the agent or to the LLM.
 */

export interface ToolExecutor {
  /** Execute a *already-authorised* call. Must respect the abort signal. */
  execute(toolId: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  /** Short human/LLM-readable summary. Always present. */
  summary: string;
  /** Structured payload handed back to the agent. */
  data?: unknown;
  error?: string;
}

export interface ConfirmationRequest {
  callId: string;
  runId: string | null;
  tool: string;
  args: Record<string, unknown>;
  risk: RiskLevel;
  reason: string;
  detail?: string;
}

export interface ConfirmationProvider {
  /** Resolve true to approve. Must reject/return false on timeout. */
  request(req: ConfirmationRequest): Promise<boolean>;
}

/** Global kill switch. Aborts in-flight work and blocks new calls. */
export class EmergencyStop {
  private controller = new AbortController();
  private active = false;
  private listeners = new Set<(active: boolean) => void>();

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Abort everything in flight. Idempotent. */
  trigger(reason = 'user'): void {
    if (this.active) return;
    this.active = true;
    this.controller.abort(reason);
    for (const listener of this.listeners) listener(true);
  }

  /** Re-arm after the user acknowledges. Creates a fresh signal. */
  reset(): void {
    this.controller = new AbortController();
    this.active = false;
    for (const listener of this.listeners) listener(false);
  }

  onChange(listener: (active: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export interface BrokerOptions {
  audit: AuditSink;
  emergencyStop: EmergencyStop;
  confirmations: ConfirmationProvider;
  getContext: () => PermissionContext;
  executor: ToolExecutor;
  now?: () => Date;
  newId?: () => string;
  /** Per-call ceiling; also bounded by the executor's own timeouts. */
  timeoutMs?: number;
}

export interface BrokerOutcome {
  ok: boolean;
  callId: string;
  decision: Decision;
  result?: ToolResult;
  error?: string;
}

export class ToolBroker {
  private readonly grantedCallIds = new Set<string>();

  constructor(private readonly options: BrokerOptions) {}

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }

  private id(): string {
    return this.options.newId?.() ?? cryptoRandomId();
  }

  async invoke(call: ToolCall, runId: string | null = null): Promise<BrokerOutcome> {
    const ctx: PermissionContext = { ...this.options.getContext(), grantedCallIds: this.grantedCallIds };
    const emergencyStop = this.options.emergencyStop;

    let evaluated = evaluate(call, { ...ctx, emergencyStopActive: ctx.emergencyStopActive || emergencyStop.isActive });

    // --- Confirmation step -------------------------------------------------
    if (evaluated.decision.outcome === 'confirm') {
      await this.write({
        runId,
        callId: call.callId,
        tool: call.tool,
        args: evaluated.args ?? call.args,
        risk: evaluated.risk,
        level: ctx.level,
        outcome: 'confirm',
        reason: evaluated.decision.reason,
        detail: evaluated.decision.detail,
      });

      let approved = false;
      try {
        approved = await this.options.confirmations.request({
          callId: call.callId,
          runId,
          tool: call.tool,
          args: evaluated.args ?? {},
          risk: evaluated.risk,
          reason: evaluated.decision.reason,
          detail: evaluated.decision.detail,
        });
      } catch {
        approved = false;
      }

      if (!approved) {
        await this.write({
          runId,
          callId: call.callId,
          tool: call.tool,
          args: evaluated.args ?? call.args,
          risk: evaluated.risk,
          level: ctx.level,
          outcome: 'deny',
          reason: 'user_declined',
          confirmedBy: null,
        });
        return { ok: false, callId: call.callId, decision: evaluated.decision, error: 'declined' };
      }

      // Re-evaluate with the grant recorded, so the *engine* still has the
      // final say. A grant can never widen capability or scope checks.
      this.grantedCallIds.add(call.callId);
      evaluated = evaluate(call, {
        ...this.options.getContext(),
        grantedCallIds: this.grantedCallIds,
        emergencyStopActive: emergencyStop.isActive,
      });
    }

    if (evaluated.decision.outcome !== 'allow') {
      await this.write({
        runId,
        callId: call.callId,
        tool: call.tool,
        args: evaluated.args ?? call.args,
        risk: evaluated.risk,
        level: ctx.level,
        outcome: 'deny',
        reason: evaluated.decision.outcome === 'deny' ? evaluated.decision.reason : 'not_allowed',
        detail: evaluated.decision.outcome === 'deny' ? evaluated.decision.detail : undefined,
      });
      return {
        ok: false,
        callId: call.callId,
        decision: evaluated.decision,
        error: evaluated.decision.outcome === 'deny' ? evaluated.decision.reason : 'not_allowed',
      };
    }

    // --- Execution ---------------------------------------------------------
    const started = this.now().getTime();
    const abort = new AbortController();
    const onStop = () => abort.abort('emergency-stop');
    emergencyStop.signal.addEventListener('abort', onStop, { once: true });
    const timeout = setTimeout(() => abort.abort('timeout'), this.options.timeoutMs ?? 120_000);

    try {
      const result = await this.options.executor.execute(call.tool, evaluated.args ?? {}, abort.signal);
      await this.write({
        runId,
        callId: call.callId,
        tool: call.tool,
        args: evaluated.args ?? call.args,
        risk: evaluated.risk,
        level: ctx.level,
        outcome: result.ok ? 'executed' : 'failed',
        durationMs: this.now().getTime() - started,
        resultSummary: result.summary,
        detail: result.error,
      });
      return { ok: result.ok, callId: call.callId, decision: evaluated.decision, result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.write({
        runId,
        callId: call.callId,
        tool: call.tool,
        args: evaluated.args ?? call.args,
        risk: evaluated.risk,
        level: ctx.level,
        outcome: 'failed',
        durationMs: this.now().getTime() - started,
        detail: message,
      });
      return { ok: false, callId: call.callId, decision: evaluated.decision, error: message };
    } finally {
      clearTimeout(timeout);
      emergencyStop.signal.removeEventListener('abort', onStop);
      this.grantedCallIds.delete(call.callId);
    }
  }

  private async write(partial: Omit<AuditRecord, 'id' | 'at'>): Promise<void> {
    await this.options.audit.append({
      ...partial,
      args: redact(partial.args),
      resultSummary: partial.resultSummary ? (redact(partial.resultSummary) as string) : undefined,
      id: this.id(),
      at: this.now().toISOString(),
    });
  }
}

function cryptoRandomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}
