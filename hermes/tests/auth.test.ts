import { describe, expect, it } from 'vitest';
import {
  ALLOWED_ORIGINS,
  NonceStore,
  TOKEN_TTL_MS,
  decodeToken,
  encodeToken,
  signRequest,
  timingSafeEqual,
  verifyRequest,
} from '@hermes/agent-protocol';

const SECRET = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

async function token(input: { method: string; path: string; body?: string; secret?: string; now?: number; nonce?: string }) {
  return encodeToken(await signRequest(input.secret ?? SECRET, input));
}

describe('local API authentication', () => {
  it('accepts a correctly signed request', async () => {
    const nonces = new NonceStore();
    const t = await token({ method: 'POST', path: '/complete', body: '{"a":1}' });
    expect(await verifyRequest(SECRET, t, { method: 'POST', path: '/complete', body: '{"a":1}' }, nonces)).toEqual({ ok: true });
  });

  it('rejects a missing token — localhost alone is not authorisation', async () => {
    const result = await verifyRequest(SECRET, undefined, { method: 'GET', path: '/health' }, new NonceStore());
    expect(result).toEqual({ ok: false, reason: 'missing_token' });
  });

  it('rejects a token signed with a different secret', async () => {
    const t = await token({ method: 'GET', path: '/x', secret: OTHER });
    const result = await verifyRequest(SECRET, t, { method: 'GET', path: '/x' }, new NonceStore());
    expect(result).toEqual({ ok: false, reason: 'bad_signature' });
  });

  it('rejects a token replayed against a different path', async () => {
    const t = await token({ method: 'GET', path: '/health' });
    const result = await verifyRequest(SECRET, t, { method: 'GET', path: '/tools/execute' }, new NonceStore());
    expect(result).toEqual({ ok: false, reason: 'path_mismatch' });
  });

  it('rejects a token replayed against a different method', async () => {
    const t = await token({ method: 'GET', path: '/x' });
    const result = await verifyRequest(SECRET, t, { method: 'DELETE', path: '/x' }, new NonceStore());
    expect(result).toEqual({ ok: false, reason: 'method_mismatch' });
  });

  it('rejects a tampered body', async () => {
    const t = await token({ method: 'POST', path: '/x', body: '{"safe":true}' });
    const result = await verifyRequest(SECRET, t, { method: 'POST', path: '/x', body: '{"safe":false}' }, new NonceStore());
    expect(result).toEqual({ ok: false, reason: 'body_mismatch' });
  });

  it('rejects an expired token', async () => {
    const past = Date.now() - TOKEN_TTL_MS * 3;
    const t = await token({ method: 'GET', path: '/x', now: past });
    const result = await verifyRequest(SECRET, t, { method: 'GET', path: '/x' }, new NonceStore());
    expect(result).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects a replayed nonce', async () => {
    const nonces = new NonceStore();
    const t = await token({ method: 'GET', path: '/x', nonce: 'fixed' });
    expect(await verifyRequest(SECRET, t, { method: 'GET', path: '/x' }, nonces)).toEqual({ ok: true });
    expect(await verifyRequest(SECRET, t, { method: 'GET', path: '/x' }, nonces)).toEqual({ ok: false, reason: 'replayed_nonce' });
  });

  it('rejects a browser origin not on the allowlist (DNS rebinding)', async () => {
    const t = await token({ method: 'GET', path: '/x' });
    const result = await verifyRequest(SECRET, t, { method: 'GET', path: '/x', origin: 'http://evil.example' }, new NonceStore());
    expect(result).toEqual({ ok: false, reason: 'forbidden_origin' });
  });

  it('accepts the Tauri origins', async () => {
    for (const origin of ALLOWED_ORIGINS) {
      const t = await token({ method: 'GET', path: '/x', nonce: `n-${origin}` });
      expect(await verifyRequest(SECRET, t, { method: 'GET', path: '/x', origin }, new NonceStore())).toEqual({ ok: true });
    }
  });

  it('rejects malformed tokens without throwing', async () => {
    for (const bad of ['', 'not-base64!!', btoa('{}'), btoa('not json')]) {
      const result = await verifyRequest(SECRET, bad, { method: 'GET', path: '/x' }, new NonceStore());
      expect(result.ok).toBe(false);
    }
  });

  it('expires nonces so the store cannot grow without bound', async () => {
    const nonces = new NonceStore();
    nonces.check('old', Date.now() - 1000);
    expect(nonces.size).toBe(1);
    nonces.check('new', Date.now() + 60_000, Date.now() + 1);
    expect(nonces.size).toBe(1);
  });

  it('round-trips a token', async () => {
    const signed = await signRequest(SECRET, { method: 'POST', path: '/p', body: 'x' });
    expect(decodeToken(encodeToken(signed))).toEqual(signed);
  });

  it('compares signatures without an early exit', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});
