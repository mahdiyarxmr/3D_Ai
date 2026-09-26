import { z } from 'zod';

/**
 * The typed tool protocol.
 *
 * The LLM never receives a shell. It receives *these* declarations, and every
 * call it emits is parsed against the zod schema below before anything else
 * happens. An unparsable call is rejected at the protocol boundary and never
 * reaches the permission engine or an executor.
 */

/** What a tool fundamentally does to the machine. Drives permission decisions. */
export type Capability =
  | 'observe' // read-only sampling of screen/system state
  | 'input' // synthetic mouse/keyboard input
  | 'fs.read'
  | 'fs.write'
  | 'fs.delete'
  | 'process' // launching/closing applications
  | 'shell' // arbitrary command interpreters
  | 'network';

/**
 * Risk classes.
 *  - SAFE:        reversible, no side effects outside HERMES.
 *  - LOW:         side effects, trivially reversible.
 *  - MEDIUM:      real side effects on user data or UI state.
 *  - HIGH:        hard to reverse, or arbitrary code execution.
 *  - CRITICAL:    destructive / security-relevant. Never silently automated.
 */
export type RiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const RISK_ORDER: Record<RiskLevel, number> = {
  SAFE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

export interface ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Stable dotted id, e.g. "computer.mouse_click". */
  id: string;
  /** i18n key for the human-readable label. */
  labelKey: string;
  capability: Capability;
  /** Baseline risk. May be escalated per-call by `escalate`. */
  risk: RiskLevel;
  schema: S;
  /**
   * Per-call risk escalation. Example: `shell.powershell` is HIGH in general,
   * but CRITICAL when the script contains `Set-ExecutionPolicy`.
   * Returning undefined keeps the baseline risk.
   */
  escalate?: (args: z.infer<S>) => { risk: RiskLevel; reason: string } | undefined;
  /** Short description handed to the LLM. */
  description: string;
}

const pathArg = z.string().min(1);

/* ------------------------------------------------------------------ *
 * Patterns that mark an operation as security-relevant / destructive.
 * Kept as data so they are testable and auditable.
 * ------------------------------------------------------------------ */

export const CRITICAL_SHELL_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\bformat\s+[a-z]:/i, reason: 'destructive.disk' },
  { pattern: /\bdiskpart\b/i, reason: 'destructive.disk' },
  { pattern: /\bvssadmin\b.*\bdelete\b/i, reason: 'destructive.disk' },
  { pattern: /\bcipher\s+\/w/i, reason: 'destructive.disk' },
  { pattern: /\brd\s+\/s\b|\brmdir\s+\/s\b/i, reason: 'destructive.delete' },
  { pattern: /\bdel\b.*\/[sq]\b/i, reason: 'destructive.delete' },
  { pattern: /Remove-Item\b[^|]*-Recurse/i, reason: 'destructive.delete' },
  { pattern: /\breg(\.exe)?\s+(add|delete)\b/i, reason: 'security.config' },
  { pattern: /Set-ExecutionPolicy/i, reason: 'security.config' },
  { pattern: /Set-MpPreference|Add-MpPreference|\bDefender\b/i, reason: 'security.antivirus' },
  { pattern: /\bnetsh\s+advfirewall\b/i, reason: 'security.firewall' },
  { pattern: /\bbcdedit\b/i, reason: 'system.boot' },
  { pattern: /\bschtasks\b|Register-ScheduledTask/i, reason: 'persistence' },
  { pattern: /New-Service|\bsc(\.exe)?\s+(create|config|delete)\b/i, reason: 'persistence' },
  { pattern: /\bnet\s+(user|localgroup)\b/i, reason: 'security.accounts' },
  { pattern: /Invoke-Expression|\biex\b|DownloadString|Invoke-WebRequest.*\|/i, reason: 'remote.code' },
  { pattern: /\bcmdkey\b|Get-Credential|ConvertTo-SecureString/i, reason: 'credentials' },
  { pattern: /\bshutdown\b|Restart-Computer|Stop-Computer/i, reason: 'system.power' },
];

/** Path fragments that always indicate credential or security-config material. */
export const SENSITIVE_PATH_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\\Windows\\System32\\config\b/i, reason: 'credentials' },
  { pattern: /\.ssh([\\/]|$)/i, reason: 'credentials' },
  { pattern: /\.aws([\\/]|$)/i, reason: 'credentials' },
  { pattern: /\.gnupg([\\/]|$)/i, reason: 'credentials' },
  { pattern: /(^|[\\/])(id_rsa|id_ed25519|\.env|credentials|\.netrc|\.git-credentials)$/i, reason: 'credentials' },
  { pattern: /[\\/]AppData[\\/]Local[\\/]Microsoft[\\/]Credentials/i, reason: 'credentials' },
  { pattern: /[\\/]Login Data$|[\\/]Cookies$|key4\.db$|logins\.json$/i, reason: 'credentials' },
  { pattern: /^[a-z]:[\\/]?$/i, reason: 'destructive.disk' },
  { pattern: /\\Windows(\\|$)/i, reason: 'system.config' },
  { pattern: /\\Startup(\\|$)|CurrentVersion\\Run/i, reason: 'persistence' },
];

function matchAny(
  value: string,
  table: { pattern: RegExp; reason: string }[],
): { reason: string } | undefined {
  for (const entry of table) {
    if (entry.pattern.test(value)) return { reason: entry.reason };
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Tool catalogue
 * ------------------------------------------------------------------ */

export const TOOLS = {
  'computer.screenshot': {
    id: 'computer.screenshot',
    labelKey: 'tools.computer.screenshot',
    capability: 'observe',
    risk: 'SAFE',
    description: 'Capture the screen or a single display. Returns an image reference.',
    schema: z.object({
      display: z.number().int().min(0).default(0),
      region: z
        .object({ x: z.number().int(), y: z.number().int(), width: z.number().int().positive(), height: z.number().int().positive() })
        .optional(),
    }),
  },
  'computer.mouse_move': {
    id: 'computer.mouse_move',
    labelKey: 'tools.computer.mouse_move',
    capability: 'input',
    risk: 'LOW',
    description: 'Move the mouse cursor to absolute screen coordinates.',
    schema: z.object({ x: z.number().int(), y: z.number().int(), durationMs: z.number().int().min(0).max(5000).default(120) }),
  },
  'computer.mouse_click': {
    id: 'computer.mouse_click',
    labelKey: 'tools.computer.mouse_click',
    capability: 'input',
    risk: 'MEDIUM',
    description: 'Click a mouse button at the current or given position.',
    schema: z.object({
      button: z.enum(['left', 'right', 'middle']).default('left'),
      x: z.number().int().optional(),
      y: z.number().int().optional(),
      clicks: z.number().int().min(1).max(3).default(1),
    }),
  },
  'computer.mouse_scroll': {
    id: 'computer.mouse_scroll',
    labelKey: 'tools.computer.mouse_scroll',
    capability: 'input',
    risk: 'LOW',
    description: 'Scroll the wheel by a number of notches.',
    schema: z.object({ dx: z.number().int().default(0), dy: z.number().int().default(0) }),
  },
  'computer.keyboard_type': {
    id: 'computer.keyboard_type',
    labelKey: 'tools.computer.keyboard_type',
    capability: 'input',
    risk: 'MEDIUM',
    description: 'Type a literal string of text.',
    schema: z.object({ text: z.string().max(10_000), delayMs: z.number().int().min(0).max(500).default(8) }),
  },
  'computer.keyboard_press': {
    id: 'computer.keyboard_press',
    labelKey: 'tools.computer.keyboard_press',
    capability: 'input',
    risk: 'MEDIUM',
    description: 'Press a single named key, e.g. "enter", "escape", "f5".',
    schema: z.object({ key: z.string().min(1).max(32) }),
  },
  'computer.hotkey': {
    id: 'computer.hotkey',
    labelKey: 'tools.computer.hotkey',
    capability: 'input',
    risk: 'HIGH',
    description: 'Press a key combination, e.g. ["ctrl","shift","esc"].',
    schema: z.object({ keys: z.array(z.string().min(1).max(32)).min(1).max(5) }),
    escalate: (args: { keys: string[] }) => {
      const combo = args.keys.map((k) => k.toLowerCase()).sort().join('+');
      // Combinations that can bypass the UI or hit security surfaces.
      const critical = ['ctrl+del+alt', 'del+meta+win', 'l+win', 'ctrl+esc+shift'];
      if (critical.includes(combo)) return { risk: 'CRITICAL' as const, reason: 'system.config' };
      return undefined;
    },
  },

  'filesystem.list': {
    id: 'filesystem.list',
    labelKey: 'tools.filesystem.list',
    capability: 'fs.read',
    risk: 'SAFE',
    description: 'List directory entries inside an allowed filesystem scope.',
    schema: z.object({ path: pathArg, recursive: z.boolean().default(false), maxEntries: z.number().int().min(1).max(5000).default(200) }),
    escalate: (args: { path: string }) => {
      const hit = matchAny(args.path, SENSITIVE_PATH_PATTERNS);
      return hit ? { risk: 'HIGH' as const, reason: hit.reason } : undefined;
    },
  },
  'filesystem.read': {
    id: 'filesystem.read',
    labelKey: 'tools.filesystem.read',
    capability: 'fs.read',
    risk: 'LOW',
    description: 'Read a UTF-8 text file inside an allowed filesystem scope.',
    schema: z.object({ path: pathArg, maxBytes: z.number().int().min(1).max(5_000_000).default(200_000) }),
    escalate: (args: { path: string }) => {
      const hit = matchAny(args.path, SENSITIVE_PATH_PATTERNS);
      return hit ? { risk: 'CRITICAL' as const, reason: hit.reason } : undefined;
    },
  },
  'filesystem.write': {
    id: 'filesystem.write',
    labelKey: 'tools.filesystem.write',
    capability: 'fs.write',
    risk: 'HIGH',
    description: 'Create or overwrite a text file inside an allowed filesystem scope.',
    schema: z.object({ path: pathArg, content: z.string().max(5_000_000), createDirs: z.boolean().default(false) }),
    escalate: (args: { path: string }) => {
      const hit = matchAny(args.path, SENSITIVE_PATH_PATTERNS);
      return hit ? { risk: 'CRITICAL' as const, reason: hit.reason } : undefined;
    },
  },
  'filesystem.copy': {
    id: 'filesystem.copy',
    labelKey: 'tools.filesystem.copy',
    capability: 'fs.write',
    risk: 'MEDIUM',
    description: 'Copy a file or directory between allowed scopes.',
    schema: z.object({ from: pathArg, to: pathArg, overwrite: z.boolean().default(false) }),
    escalate: (args: { from: string; to: string }) => {
      const hit = matchAny(args.to, SENSITIVE_PATH_PATTERNS) ?? matchAny(args.from, SENSITIVE_PATH_PATTERNS);
      return hit ? { risk: 'CRITICAL' as const, reason: hit.reason } : undefined;
    },
  },
  'filesystem.move': {
    id: 'filesystem.move',
    labelKey: 'tools.filesystem.move',
    capability: 'fs.write',
    risk: 'HIGH',
    description: 'Move or rename a file or directory between allowed scopes.',
    schema: z.object({ from: pathArg, to: pathArg, overwrite: z.boolean().default(false) }),
    escalate: (args: { from: string; to: string }) => {
      const hit = matchAny(args.from, SENSITIVE_PATH_PATTERNS) ?? matchAny(args.to, SENSITIVE_PATH_PATTERNS);
      return hit ? { risk: 'CRITICAL' as const, reason: hit.reason } : undefined;
    },
  },
  'filesystem.delete': {
    id: 'filesystem.delete',
    labelKey: 'tools.filesystem.delete',
    capability: 'fs.delete',
    risk: 'CRITICAL',
    description: 'Delete a file or directory. Always confirmation-gated.',
    schema: z.object({ path: pathArg, recursive: z.boolean().default(false) }),
  },

  'applications.open': {
    id: 'applications.open',
    labelKey: 'tools.applications.open',
    capability: 'process',
    risk: 'HIGH',
    description: 'Launch an application by name or path, with optional arguments.',
    schema: z.object({ target: z.string().min(1), args: z.array(z.string()).max(32).default([]) }),
  },
  'applications.close': {
    id: 'applications.close',
    labelKey: 'tools.applications.close',
    capability: 'process',
    risk: 'MEDIUM',
    description: 'Request a window to close gracefully.',
    schema: z.object({ windowId: z.string().min(1), force: z.boolean().default(false) }),
    escalate: (args: { force: boolean }) => (args.force ? { risk: 'HIGH' as const, reason: 'process.force_kill' } : undefined),
  },
  'applications.focus': {
    id: 'applications.focus',
    labelKey: 'tools.applications.focus',
    capability: 'process',
    risk: 'LOW',
    description: 'Bring a window to the foreground.',
    schema: z.object({ windowId: z.string().min(1) }),
  },
  'applications.list_windows': {
    id: 'applications.list_windows',
    labelKey: 'tools.applications.list_windows',
    capability: 'observe',
    risk: 'SAFE',
    description: 'List open top-level windows with titles and bounds.',
    schema: z.object({ includeMinimised: z.boolean().default(true) }),
  },

  'shell.cmd': {
    id: 'shell.cmd',
    labelKey: 'tools.shell.cmd',
    capability: 'shell',
    risk: 'HIGH',
    description: 'Run a Windows cmd.exe command and capture its output.',
    schema: z.object({ command: z.string().min(1).max(8_000), cwd: z.string().optional(), timeoutMs: z.number().int().min(100).max(600_000).default(30_000) }),
    escalate: (args: { command: string }) => {
      const hit = matchAny(args.command, CRITICAL_SHELL_PATTERNS);
      return hit ? { risk: 'CRITICAL' as const, reason: hit.reason } : undefined;
    },
  },
  'shell.powershell': {
    id: 'shell.powershell',
    labelKey: 'tools.shell.powershell',
    capability: 'shell',
    risk: 'HIGH',
    description: 'Run a PowerShell script block and capture its output.',
    schema: z.object({ script: z.string().min(1).max(16_000), cwd: z.string().optional(), timeoutMs: z.number().int().min(100).max(600_000).default(30_000) }),
    escalate: (args: { script: string }) => {
      const hit = matchAny(args.script, CRITICAL_SHELL_PATTERNS);
      return hit ? { risk: 'CRITICAL' as const, reason: hit.reason } : undefined;
    },
  },

  'system.info': {
    id: 'system.info',
    labelKey: 'tools.system.info',
    capability: 'observe',
    risk: 'SAFE',
    description: 'Return OS, CPU, memory and display information.',
    schema: z.object({}),
  },
  'system.processes': {
    id: 'system.processes',
    labelKey: 'tools.system.processes',
    capability: 'observe',
    risk: 'SAFE',
    description: 'List running processes with pid, name and memory usage.',
    schema: z.object({ limit: z.number().int().min(1).max(1000).default(100) }),
  },
} as const satisfies Record<string, ToolDefinition>;

export type ToolId = keyof typeof TOOLS;
export const TOOL_IDS = Object.keys(TOOLS) as ToolId[];

export function getTool(id: string): ToolDefinition | undefined {
  return (TOOLS as Record<string, ToolDefinition>)[id];
}

export interface ToolCall {
  callId: string;
  tool: string;
  args: unknown;
}

export type ParsedToolCall =
  | { ok: true; tool: ToolDefinition; args: Record<string, unknown>; risk: RiskLevel; escalationReason?: string }
  | { ok: false; error: string; code: 'unknown_tool' | 'invalid_args' };

/**
 * Protocol boundary. Anything the LLM produces must survive this function
 * before the permission engine is even consulted.
 */
export function parseToolCall(call: ToolCall): ParsedToolCall {
  const tool = getTool(call.tool);
  if (!tool) return { ok: false, error: `Unknown tool: ${call.tool}`, code: 'unknown_tool' };

  const parsed = tool.schema.safeParse(call.args ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') || '(root)';
    return { ok: false, error: `Invalid arguments for ${tool.id}: ${where}: ${issue?.message ?? 'invalid'}`, code: 'invalid_args' };
  }

  const args = parsed.data as Record<string, unknown>;
  const escalation = tool.escalate?.(args);
  if (escalation && RISK_ORDER[escalation.risk] > RISK_ORDER[tool.risk]) {
    return { ok: true, tool, args, risk: escalation.risk, escalationReason: escalation.reason };
  }
  return { ok: true, tool, args, risk: tool.risk };
}

/** Declarations handed to the LLM. Deliberately excludes executor details. */
export function toolDeclarations(): { name: string; description: string; risk: RiskLevel; parameters: unknown }[] {
  return TOOL_IDS.map((id) => {
    const t = TOOLS[id] as ToolDefinition;
    return { name: t.id, description: t.description, risk: t.risk, parameters: zodToJsonish(t.schema) };
  });
}

/** Minimal JSON-schema-ish projection; enough for provider function-calling. */
function zodToJsonish(schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonish(value);
      if (!value.isOptional()) required.push(key);
    }
    return { type: 'object', properties, required };
  }
  if (schema instanceof z.ZodDefault) return zodToJsonish(schema._def.innerType);
  if (schema instanceof z.ZodOptional) return zodToJsonish(schema._def.innerType);
  if (schema instanceof z.ZodArray) return { type: 'array', items: zodToJsonish(schema._def.type) };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema._def.values };
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  return {};
}
