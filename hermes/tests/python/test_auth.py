"""The Python auth layer must agree with the TypeScript one, byte for byte."""

from __future__ import annotations

import base64
import json
import time

import pytest

from services.common.auth import (
    AuthError,
    NonceStore,
    make_token,
    sha256_hex,
    sign,
    verify_request,
)

SECRET = "a" * 64
OTHER = "b" * 64


def test_accepts_a_valid_request() -> None:
    token = make_token(SECRET, "POST", "/complete", '{"a":1}')
    verify_request(SECRET, token, "POST", "/complete", '{"a":1}', NonceStore())


def test_localhost_alone_is_not_authorisation() -> None:
    with pytest.raises(AuthError) as exc:
        verify_request(SECRET, None, "GET", "/health", "", NonceStore())
    assert exc.value.reason == "missing_token"


def test_rejects_wrong_secret() -> None:
    token = make_token(OTHER, "GET", "/x")
    with pytest.raises(AuthError) as exc:
        verify_request(SECRET, token, "GET", "/x", "", NonceStore())
    assert exc.value.reason == "bad_signature"


@pytest.mark.parametrize(
    ("method", "path", "body", "reason"),
    [
        ("DELETE", "/x", "", "method_mismatch"),
        ("GET", "/other", "", "path_mismatch"),
        ("GET", "/x", "tampered", "body_mismatch"),
    ],
)
def test_rejects_replay_against_a_different_request(method: str, path: str, body: str, reason: str) -> None:
    token = make_token(SECRET, "GET", "/x", "")
    with pytest.raises(AuthError) as exc:
        verify_request(SECRET, token, method, path, body, NonceStore())
    assert exc.value.reason == reason


def test_rejects_expired_token() -> None:
    past = int(time.time() * 1000) - 300_000
    token = make_token(SECRET, "GET", "/x", now_ms=past)
    with pytest.raises(AuthError) as exc:
        verify_request(SECRET, token, "GET", "/x", "", NonceStore())
    assert exc.value.reason == "expired"


def test_rejects_replayed_nonce() -> None:
    nonces = NonceStore()
    token = make_token(SECRET, "GET", "/x", nonce="fixed")
    verify_request(SECRET, token, "GET", "/x", "", nonces)
    with pytest.raises(AuthError) as exc:
        verify_request(SECRET, token, "GET", "/x", "", nonces)
    assert exc.value.reason == "replayed_nonce"


def test_blocks_browser_origins_not_on_the_allowlist() -> None:
    token = make_token(SECRET, "GET", "/x")
    with pytest.raises(AuthError) as exc:
        verify_request(SECRET, token, "GET", "/x", "", NonceStore(), origin="http://evil.example")
    assert exc.value.reason == "forbidden_origin"


def test_allows_the_tauri_origin() -> None:
    token = make_token(SECRET, "GET", "/x")
    verify_request(SECRET, token, "GET", "/x", "", NonceStore(), origin="tauri://localhost")


@pytest.mark.parametrize("token", ["", "!!!not base64!!!", base64.b64encode(b"{}").decode(), base64.b64encode(b"nope").decode()])
def test_malformed_tokens_raise_rather_than_crash(token: str) -> None:
    with pytest.raises(AuthError):
        verify_request(SECRET, token, "GET", "/x", "", NonceStore())


def test_nonce_store_expires_entries() -> None:
    nonces = NonceStore()
    now = int(time.time() * 1000)
    nonces.check("old", now - 1, now - 1000)
    assert len(nonces) == 1
    nonces.check("new", now + 60_000, now)
    assert len(nonces) == 1


def test_canonical_string_matches_the_typescript_layout() -> None:
    # Same five fields, newline-joined, in the same order. If this changes,
    # packages/agent-protocol/src/auth.ts must change identically.
    token = make_token(SECRET, "post", "/p", "body", nonce="n", now_ms=1_000_000)
    claims = json.loads(base64.b64decode(token))
    expected = sign(SECRET, "\n".join(["POST", "/p", sha256_hex("body"), "n", str(claims["expiresAt"])]))
    assert claims["signature"] == expected
    assert claims["method"] == "POST"
