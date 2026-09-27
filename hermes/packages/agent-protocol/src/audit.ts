import type { RiskLevel } from './tools.js';
import type { Decision } from './permissions.js';

/**
 * Audit log.
 *
 * Every decision — allowed, denied, confirmed, or rejected at the protocol
 * boundary — produces exactly one record. Records are append-only; there is
 * deliberately no update or delete in this interface.
 */
export interface AuditRecord {
  id: string;
  at: string; // ISO-8601
  runId: string | null;
  callId: string;
  tool: string;
  /** Arguments after redaction. Never raw secrets. */
  args: unknown;
  risk: RiskLevel;
  level: string;
  outcome: Decision['outcome'] | 'executed' | 'failed';
  reason?: string;
  detail?: string;
  /** Populated for executed/failed records. */
  durationMs?: number;
  resultSummary?: string;
  /** Who approved, when a confirmation was involved. */
  confirmedBy?: 'user' | 'policy' | null;
}

export interface AuditSink {
  append(record: AuditRecord): Promise<void> | void;
  query(filter?: { since?: string; tool?: string; limit?: number }): Promise<AuditRecord[]> | AuditRecord[];
}

/** In-memory sink used by tests and by the browser dev harness. */
export class MemoryAuditSink implements AuditSink {
  private records: AuditRecord[] = [];

  append(record: AuditRecord): void {
    this.records.push(record);
  }

  query(filter: { since?: string; tool?: string; limit?: number } = {}): AuditRecord[] {
    let out = this.records;
    if (filter.since) out = out.filter((r) => r.at >= filter.since!);
    if (filter.tool) out = out.filter((r) => r.tool === filter.tool);
    out = [...out].reverse();
    return filter.limit ? out.slice(0, filter.limit) : out;
  }

  get all(): readonly AuditRecord[] {
    return this.records;
  }
}

const SECRET_KEYS = /^(password|passwd|secret|token|api[_-]?key|authorization|credential)s?$/i;
const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\b(sk|pk)-[A-Za-z0-9_-]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{16,}=*/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
];

export const REDACTED = '[redacted]';

/**
 * Redact obvious credential material before anything is written to disk.
 * docs/PRIVACY.md: "API keys and credentials must never be included in logs."
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return REDACTED;
  if (typeof value === 'string') {
    let out = value;
    for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
    return out.length > 4000 ? `${out.slice(0, 4000)}…[truncated]` : out;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}
