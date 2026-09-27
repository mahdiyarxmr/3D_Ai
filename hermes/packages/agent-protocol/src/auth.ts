/**
 * Local API / IPC authentication.
 *
 * "Listening on 127.0.0.1" is NOT an authorisation boundary: any process on
 * the machine, and any web page via a browser, can reach it. HERMES therefore
 * treats its own local services as untrusted callers.
 *
 * Scheme
 * ------
 * 1. On launch the Rust core generates a 256-bit session secret and writes it
 *    to `storage/settings/session.json` with owner-only ACLs (see
 *    src-tauri/src/auth.rs). It is never logged and never sent to a provider.
 * 2. Every request carries `Authorization: Bearer <token>` where the token is
 *    an HMAC over (method, path, body-hash, nonce, expiry) — so a leaked
 *    request cannot be replayed against a different endpoint.
 * 3. Services reject any request whose `Origin` header is present and not in
 *    the allowlist, which blocks browser-originated DNS-rebinding attacks.
 * 4. Nonces are single-use within the expiry window.
 */

export const TOKEN_TTL_MS = 60_000;
export const ALLOWED_ORIGINS: readonly string[] = ['tauri://localhost', 'https://tauri.localhost'];

export interface SignedRequest {
  method: string;
  path: string;
  bodyHash: string;
  nonce: string;
  expiresAt: number;
  signature: string;
}

export type AuthFailure =
  | 'missing_token'
  | 'malformed_token'
  | 'bad_signature'
  | 'expired'
  | 'replayed_nonce'
  | 'method_mismatch'
  | 'path_mismatch'
  | 'body_mismatch'
  | 'forbidden_origin';

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

async function hmac(secret: string, message: string): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) throw new Error('WebCrypto unavailable; cannot sign local API requests');
  const enc = new TextEncoder();
  const key = await subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await subtle.sign('HMAC', key, enc.encode(message));
  return toHex(new Uint8Array(sig));
}

export async function sha256Hex(input: string): Promise<string> {
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle;
  if (!subtle) throw new Error('WebCrypto unavailable');
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function canonical(req: Omit<SignedRequest, 'signature'>): string {
  return [req.method.toUpperCase(), req.path, req.bodyHash, req.nonce, String(req.expiresAt)].join('\n');
}

export async function signRequest(
  secret: string,
  input: { method: string; path: string; body?: string; now?: number; nonce?: string },
): Promise<SignedRequest> {
  const now = input.now ?? Date.now();
  const unsigned = {
    method: input.method.toUpperCase(),
    path: input.path,
    bodyHash: await sha256Hex(input.body ?? ''),
    nonce: input.nonce ?? randomNonce(),
    expiresAt: now + TOKEN_TTL_MS,
  };
  return { ...unsigned, signature: await hmac(secret, canonical(unsigned)) };
}

export function encodeToken(signed: SignedRequest): string {
  return btoaUtf8(JSON.stringify(signed));
}

export function decodeToken(token: string): SignedRequest | null {
  try {
    const parsed = JSON.parse(atobUtf8(token)) as SignedRequest;
    if (
      typeof parsed.method !== 'string' ||
      typeof parsed.path !== 'string' ||
      typeof parsed.bodyHash !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      typeof parsed.signature !== 'string'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Replay protection. Bounded memory: entries expire with the token TTL. */
export class NonceStore {
  private seen = new Map<string, number>();

  check(nonce: string, expiresAt: number, now = Date.now()): boolean {
    this.sweep(now);
    if (this.seen.has(nonce)) return false;
    this.seen.set(nonce, expiresAt);
    return true;
  }

  private sweep(now: number): void {
    for (const [nonce, expiry] of this.seen) if (expiry < now) this.seen.delete(nonce);
  }

  get size(): number {
    return this.seen.size;
  }
}

export async function verifyRequest(
  secret: string,
  token: string | undefined,
  actual: { method: string; path: string; body?: string; origin?: string },
  nonces: NonceStore,
  now = Date.now(),
): Promise<AuthResult> {
  if (actual.origin && !ALLOWED_ORIGINS.includes(actual.origin)) return { ok: false, reason: 'forbidden_origin' };
  if (!token) return { ok: false, reason: 'missing_token' };

  const signed = decodeToken(token);
  if (!signed) return { ok: false, reason: 'malformed_token' };
  if (signed.expiresAt < now) return { ok: false, reason: 'expired' };
  if (signed.method.toUpperCase() !== actual.method.toUpperCase()) return { ok: false, reason: 'method_mismatch' };
  if (signed.path !== actual.path) return { ok: false, reason: 'path_mismatch' };
  if (signed.bodyHash !== (await sha256Hex(actual.body ?? ''))) return { ok: false, reason: 'body_mismatch' };

  const { signature, ...unsigned } = signed;
  const expected = await hmac(secret, canonical(unsigned));
  if (!timingSafeEqual(signature, expected)) return { ok: false, reason: 'bad_signature' };
  if (!nonces.check(signed.nonce, signed.expiresAt, now)) return { ok: false, reason: 'replayed_nonce' };

  return { ok: true };
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function randomNonce(): string {
  const g = globalThis.crypto as Crypto | undefined;
  if (g?.getRandomValues) {
    const bytes = new Uint8Array(16);
    g.getRandomValues(bytes);
    return toHex(bytes);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function btoaUtf8(s: string): string {
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(s)));
  return Buffer.from(s, 'utf8').toString('base64');
}

function atobUtf8(s: string): string {
  if (typeof atob === 'function') return decodeURIComponent(escape(atob(s)));
  return Buffer.from(s, 'base64').toString('utf8');
}
