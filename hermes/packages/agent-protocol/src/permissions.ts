import type { PermissionLevel } from '@hermes/shared';
import {
  type Capability,
  type RiskLevel,
  RISK_ORDER,
  type ToolDefinition,
  type ToolCall,
  TOOL_IDS,
  getTool,
  parseToolCall,
} from './tools.js';

/**
 * The permission engine.
 *
 * This is the single authority that decides whether a tool call may run. It is
 * pure and synchronous so it can be exhaustively unit-tested; anything
 * stateful (confirmations, audit writes, execution) lives in the broker.
 */

export type Decision =
  | { outcome: 'allow'; risk: RiskLevel }
  | { outcome: 'confirm'; risk: RiskLevel; reason: DenyReason; detail?: string }
  | { outcome: 'deny'; risk: RiskLevel; reason: DenyReason; detail?: string };

export type DenyReason =
  | 'unknown_tool'
  | 'invalid_args'
  | 'level_forbids_capability'
  | 'denylisted'
  | 'not_allowlisted'
  | 'outside_filesystem_scope'
  | 'high_risk_requires_confirmation'
  | 'always_confirm'
  | 'emergency_stop'
  | 'blocked_category';

/** Capabilities each level may use at all. */
export const LEVEL_CAPABILITIES: Record<PermissionLevel, ReadonlySet<Capability>> = {
  // Read-only sampling only. No synthetic input, no writes, no shell.
  OBSERVE: new Set<Capability>(['observe', 'fs.read']),
  ASSIST: new Set<Capability>(['observe', 'fs.read', 'fs.write', 'fs.delete', 'input', 'process', 'shell', 'network']),
  AUTONOMOUS: new Set<Capability>(['observe', 'fs.read', 'fs.write', 'fs.delete', 'input', 'process', 'shell', 'network']),
};

/**
 * Highest risk each level may run WITHOUT asking the user.
 * Anything above requires explicit confirmation.
 */
export const LEVEL_AUTO_RISK: Record<PermissionLevel, RiskLevel> = {
  OBSERVE: 'LOW',
  ASSIST: 'MEDIUM',
  AUTONOMOUS: 'HIGH',
};

/**
 * Escalation reasons that remain confirmation-required at EVERY level,
 * including AUTONOMOUS. This is the "autonomous cannot bypass" guarantee.
 */
export const ALWAYS_CONFIRM_REASONS: ReadonlySet<string> = new Set([
  'destructive.delete',
  'destructive.disk',
  'security.config',
  'security.firewall',
  'security.accounts',
  'system.config',
  'system.boot',
  'system.power',
  'persistence',
  'credentials',
  'remote.code',
  'process.force_kill',
]);

/**
 * Categories that are hard-blocked regardless of level or confirmation.
 * Disabling security software is never an action HERMES will perform.
 */
export const BLOCKED_REASONS: ReadonlySet<string> = new Set(['security.antivirus']);

/** Tools that always require confirmation no matter the level. */
export const ALWAYS_CONFIRM_TOOLS: ReadonlySet<string> = new Set(['filesystem.delete']);

export interface PermissionContext {
  level: PermissionLevel;
  toolAllowlist: readonly string[];
  toolDenylist: readonly string[];
  /** Absolute directories the fs.* tools may touch. Empty = no fs access. */
  filesystemScopes: readonly string[];
  emergencyStopActive: boolean;
  /** Confirmations already granted for this exact call id. */
  grantedCallIds?: ReadonlySet<string>;
}

export interface EvaluatedCall {
  callId: string;
  toolId: string;
  tool?: ToolDefinition;
  args?: Record<string, unknown>;
  risk: RiskLevel;
  escalationReason?: string;
  decision: Decision;
}

/** Argument keys that carry filesystem paths, per tool. */
const PATH_ARG_KEYS: Record<string, string[]> = {
  'filesystem.list': ['path'],
  'filesystem.read': ['path'],
  'filesystem.write': ['path'],
  'filesystem.delete': ['path'],
  'filesystem.copy': ['from', 'to'],
  'filesystem.move': ['from', 'to'],
};

/** Normalise separators and collapse `.`/`..` without touching the disk. */
export function normalisePath(input: string): string {
  const win = /^[a-zA-Z]:/.test(input);
  let s = input.replace(/\\/g, '/');
  const isAbs = s.startsWith('/') || win;
  const parts: string[] = [];
  for (const segment of s.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
      else if (!isAbs) parts.push('..');
      continue;
    }
    parts.push(segment);
  }
  s = parts.join('/');
  if (win) return s.replace(/^([a-zA-Z]):/, (_m, d: string) => `${d.toUpperCase()}:`);
  return isAbs ? `/${s}` : s;
}

/** True if `candidate` is inside `scope` (scope itself counts as inside). */
export function isWithinScope(candidate: string, scope: string): boolean {
  const c = normalisePath(candidate);
  const s = normalisePath(scope).replace(/\/$/, '');
  if (s === '') return false;
  const ci = isCaseInsensitive(c) ? c.toLowerCase() : c;
  const si = isCaseInsensitive(s) ? s.toLowerCase() : s;
  return ci === si || ci.startsWith(`${si}/`);
}

function isCaseInsensitive(p: string): boolean {
  return /^[a-zA-Z]:/.test(p);
}

/**
 * Evaluate a raw tool call end to end: protocol parse -> capability ->
 * allow/denylist -> filesystem scope -> risk -> confirmation.
 */
export function evaluate(call: ToolCall, ctx: PermissionContext): EvaluatedCall {
  const base = { callId: call.callId, toolId: call.tool };

  // 0. Emergency stop short-circuits everything.
  if (ctx.emergencyStopActive) {
    return { ...base, risk: 'SAFE', decision: { outcome: 'deny', risk: 'SAFE', reason: 'emergency_stop' } };
  }

  // 1. Protocol boundary.
  const parsed = parseToolCall(call);
  if (!parsed.ok) {
    return {
      ...base,
      risk: 'SAFE',
      decision: { outcome: 'deny', risk: 'SAFE', reason: parsed.code, detail: parsed.error },
    };
  }
  const { tool, args, risk, escalationReason } = parsed;
  const withParsed = { ...base, tool, args, risk, escalationReason };

  // 2. Hard-blocked categories. No level, no confirmation, ever.
  if (escalationReason && BLOCKED_REASONS.has(escalationReason)) {
    return { ...withParsed, decision: { outcome: 'deny', risk, reason: 'blocked_category', detail: escalationReason } };
  }

  // 3. Explicit denylist always wins.
  if (ctx.toolDenylist.includes(tool.id)) {
    return { ...withParsed, decision: { outcome: 'deny', risk, reason: 'denylisted' } };
  }

  // 4. Capability must be permitted by the level.
  if (!LEVEL_CAPABILITIES[ctx.level].has(tool.capability)) {
    return {
      ...withParsed,
      decision: { outcome: 'deny', risk, reason: 'level_forbids_capability', detail: `${ctx.level} cannot use capability '${tool.capability}'` },
    };
  }

  // 5. Non-empty allowlist is exclusive.
  if (ctx.toolAllowlist.length > 0 && !ctx.toolAllowlist.includes(tool.id)) {
    return { ...withParsed, decision: { outcome: 'deny', risk, reason: 'not_allowlisted' } };
  }

  // 6. Filesystem scope enforcement.
  const pathKeys = PATH_ARG_KEYS[tool.id];
  if (pathKeys) {
    for (const key of pathKeys) {
      const value = args[key];
      if (typeof value !== 'string') continue;
      const allowed = ctx.filesystemScopes.some((scope) => isWithinScope(value, scope));
      if (!allowed) {
        return {
          ...withParsed,
          decision: { outcome: 'deny', risk, reason: 'outside_filesystem_scope', detail: `${key}=${value}` },
        };
      }
    }
  }

  // 7. Already-granted confirmation for this specific call.
  const preGranted = ctx.grantedCallIds?.has(call.callId) ?? false;

  // 8. Categories that always need a human, even in AUTONOMOUS.
  const alwaysConfirm =
    ALWAYS_CONFIRM_TOOLS.has(tool.id) || (escalationReason !== undefined && ALWAYS_CONFIRM_REASONS.has(escalationReason));
  if (alwaysConfirm) {
    if (preGranted) return { ...withParsed, decision: { outcome: 'allow', risk } };
    return { ...withParsed, decision: { outcome: 'confirm', risk, reason: 'always_confirm', detail: escalationReason } };
  }

  // 9. Risk budget for the current level.
  if (RISK_ORDER[risk] > RISK_ORDER[LEVEL_AUTO_RISK[ctx.level]]) {
    if (preGranted) return { ...withParsed, decision: { outcome: 'allow', risk } };
    return {
      ...withParsed,
      decision: {
        outcome: 'confirm',
        risk,
        reason: 'high_risk_requires_confirmation',
        detail: `${risk} exceeds ${ctx.level} auto-approval limit ${LEVEL_AUTO_RISK[ctx.level]}`,
      },
    };
  }

  return { ...withParsed, decision: { outcome: 'allow', risk } };
}

/** Tools the LLM should even be told about, given the current level. */
export function visibleTools(ctx: Pick<PermissionContext, 'level' | 'toolAllowlist' | 'toolDenylist'>): string[] {
  const caps = LEVEL_CAPABILITIES[ctx.level];
  return (TOOL_IDS as readonly string[]).filter((id) => {
    const tool = getTool(id);
    if (!tool) return false;
    if (ctx.toolDenylist.includes(id)) return false;
    if (ctx.toolAllowlist.length > 0 && !ctx.toolAllowlist.includes(id)) return false;
    return caps.has(tool.capability);
  });
}
