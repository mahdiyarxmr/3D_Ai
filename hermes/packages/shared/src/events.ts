import type { Emotion } from './character.js';

/** Wire events emitted by the agent/voice/avatar subsystems (see docs/API.md). */
export type HermesEvent =
  | { type: 'agent.started'; runId: string; goal: string }
  | { type: 'agent.thinking'; runId: string; thought: string }
  | { type: 'agent.tool.started'; runId: string; callId: string; tool: string; args: unknown }
  | { type: 'agent.tool.completed'; runId: string; callId: string; ok: boolean; summary: string }
  | { type: 'agent.permission.required'; runId: string; callId: string; tool: string; reason: string; risk: string }
  | { type: 'agent.message'; runId: string; text: string; emotion: Emotion }
  | { type: 'agent.completed'; runId: string; text: string }
  | { type: 'agent.interrupted'; runId: string; reason: string }
  | { type: 'voice.started'; utteranceId: string }
  | { type: 'voice.viseme'; utteranceId: string; viseme: string; weight: number; tMs: number }
  | { type: 'voice.completed'; utteranceId: string }
  | { type: 'avatar.expression'; emotion: Emotion; weight: number }
  | { type: 'emergency.stop'; at: string };

export type HermesEventType = HermesEvent['type'];
