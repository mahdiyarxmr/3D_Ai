import type { Emotion, SupportedLanguage } from '@hermes/shared';
import type { BrokerOutcome, ToolBroker } from './broker.js';
import type { EmergencyStop } from './broker.js';
import type { ToolCall } from './tools.js';

/**
 * Agent loop:
 *   Observe -> Reason -> Plan -> Permission -> Execute -> Observe -> Verify -> Continue
 *
 * The loop itself is provider-agnostic. Swapping OpenAI / a local model /
 * anything else means implementing `LlmProvider` — nothing in this file
 * changes.
 */

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  name?: string;
}

/** What the model decided to do this turn. */
export type AgentStep =
  | { kind: 'final'; text: string; emotion: Emotion }
  | { kind: 'tool'; thought: string; calls: ToolCall[] }
  | { kind: 'verify'; thought: string; call: ToolCall };

export interface LlmRequest {
  messages: AgentMessage[];
  /** Only the tools the current permission level exposes. */
  availableTools: { name: string; description: string; risk: string; parameters: unknown }[];
  language: SupportedLanguage;
  signal: AbortSignal;
}

export interface LlmProvider {
  readonly id: string;
  complete(request: LlmRequest): Promise<AgentStep>;
}

export interface AgentRunOptions {
  goal: string;
  systemPrompt: string;
  language: SupportedLanguage;
  maxIterations?: number;
  /** Tools to advertise; usually `visibleTools(ctx)` mapped to declarations. */
  availableTools: { name: string; description: string; risk: string; parameters: unknown }[];
  history?: AgentMessage[];
}

export type AgentEvent =
  | { type: 'started'; runId: string; goal: string }
  | { type: 'thinking'; runId: string; thought: string }
  | { type: 'tool.started'; runId: string; callId: string; tool: string; args: unknown }
  | { type: 'tool.completed'; runId: string; callId: string; ok: boolean; summary: string }
  | { type: 'verifying'; runId: string; callId: string }
  | { type: 'message'; runId: string; text: string; emotion: Emotion }
  | { type: 'completed'; runId: string; text: string }
  | { type: 'interrupted'; runId: string; reason: string };

export interface AgentDeps {
  provider: LlmProvider;
  broker: ToolBroker;
  emergencyStop: EmergencyStop;
  emit: (event: AgentEvent) => void;
  newId?: () => string;
}

export class Agent {
  constructor(private readonly deps: AgentDeps) {}

  private id(): string {
    return this.deps.newId?.() ?? `run-${Math.random().toString(36).slice(2, 10)}`;
  }

  async run(options: AgentRunOptions): Promise<{ runId: string; text: string; interrupted: boolean }> {
    const runId = this.id();
    const { provider, broker, emergencyStop, emit } = this.deps;
    const maxIterations = options.maxIterations ?? 12;

    const messages: AgentMessage[] = [
      { role: 'system', content: options.systemPrompt },
      ...(options.history ?? []),
      { role: 'user', content: options.goal },
    ];

    emit({ type: 'started', runId, goal: options.goal });

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (emergencyStop.isActive) {
        emit({ type: 'interrupted', runId, reason: 'emergency_stop' });
        return { runId, text: '', interrupted: true };
      }

      // --- Reason / Plan ---------------------------------------------------
      let step: AgentStep;
      try {
        step = await provider.complete({
          messages,
          availableTools: options.availableTools,
          language: options.language,
          signal: emergencyStop.signal,
        });
      } catch (err) {
        const reason = emergencyStop.isActive ? 'emergency_stop' : err instanceof Error ? err.message : String(err);
        emit({ type: 'interrupted', runId, reason });
        return { runId, text: '', interrupted: true };
      }

      if (step.kind === 'final') {
        emit({ type: 'message', runId, text: step.text, emotion: step.emotion });
        emit({ type: 'completed', runId, text: step.text });
        return { runId, text: step.text, interrupted: false };
      }

      const calls = step.kind === 'tool' ? step.calls : [step.call];
      emit({ type: 'thinking', runId, thought: step.thought });
      messages.push({ role: 'assistant', content: step.thought });

      // --- Permission + Execute (sequential: order matters for UI actions) --
      for (const call of calls) {
        if (emergencyStop.isActive) {
          emit({ type: 'interrupted', runId, reason: 'emergency_stop' });
          return { runId, text: '', interrupted: true };
        }

        emit({ type: 'tool.started', runId, callId: call.callId, tool: call.tool, args: call.args });
        const outcome: BrokerOutcome = await broker.invoke(call, runId);
        const summary = outcome.result?.summary ?? outcome.error ?? 'no result';
        emit({ type: 'tool.completed', runId, callId: call.callId, ok: outcome.ok, summary });

        // --- Observe: the result is fed straight back into the transcript ---
        messages.push({
          role: 'tool',
          name: call.tool,
          toolCallId: call.callId,
          content: JSON.stringify({ ok: outcome.ok, summary, data: outcome.result?.data, error: outcome.error }),
        });

        // --- Verify: meaningful (non read-only) actions get re-observed -----
        if (outcome.ok && isMeaningful(call.tool)) {
          emit({ type: 'verifying', runId, callId: call.callId });
          const verifyCall: ToolCall = {
            callId: `${call.callId}-verify`,
            tool: 'computer.screenshot',
            args: {},
          };
          const verification = await broker.invoke(verifyCall, runId);
          messages.push({
            role: 'tool',
            name: 'computer.screenshot',
            toolCallId: verifyCall.callId,
            content: JSON.stringify({
              purpose: 'verification',
              ok: verification.ok,
              summary: verification.result?.summary ?? verification.error,
            }),
          });
        }
      }
    }

    emit({ type: 'interrupted', runId, reason: 'max_iterations' });
    return { runId, text: '', interrupted: true };
  }
}

/** Actions that change machine state and therefore warrant re-observation. */
export function isMeaningful(toolId: string): boolean {
  return (
    toolId.startsWith('computer.mouse_click') ||
    toolId.startsWith('computer.keyboard') ||
    toolId.startsWith('computer.hotkey') ||
    toolId.startsWith('applications.open') ||
    toolId.startsWith('applications.close') ||
    toolId.startsWith('shell.')
  );
}
