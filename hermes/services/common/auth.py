"""HMAC request authentication for the local services.

Mirrors packages/agent-protocol/src/auth.ts exactly: same canonical string,
same HMAC-SHA256, same replay window. See docs/SECURITY.md for the rationale.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

TOKEN_TTL_MS = 60_000
ALLOWED_ORIGINS = ("tauri://localhost", "https://tauri.localhost")


class AuthError(Exception):
    """Raised when a request cannot be authenticated."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def load_session_secret(path: str | Path) -> str:
    """Read the per-launch secret written by the Rust core."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    secret = data.get("secret")
    if not isinstance(secret, str) or len(secret) < 32:
        raise AuthError("malformed_secret")
    return secret


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def canonical(method: str, path: str, body_hash: str, nonce: str, expires_at: int) -> str:
    return "\n".join([method.upper(), path, body_hash, nonce, str(expires_at)])


def sign(secret: str, message: str) -> str:
    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def decode_token(token: str) -> dict:
    try:
        return json.loads(base64.b64decode(token).decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 - any decode failure is the same class of error
        raise AuthError("malformed_token") from exc


@dataclass
class NonceStore:
    """Single-use nonce tracking, bounded by the token TTL."""

    _seen: dict[str, int] = field(default_factory=dict)

    def check(self, nonce: str, expires_at: int, now_ms: int) -> bool:
        self._sweep(now_ms)
        if nonce in self._seen:
            return False
        self._seen[nonce] = expires_at
        return True

    def _sweep(self, now_ms: int) -> None:
        for key in [k for k, v in self._seen.items() if v < now_ms]:
            del self._seen[key]

    def __len__(self) -> int:
        return len(self._seen)


def verify_request(
    secret: str,
    token: str | None,
    method: str,
    path: str,
    body: str,
    nonces: NonceStore,
    origin: str | None = None,
    now_ms: int | None = None,
    allowed_origins: Iterable[str] = ALLOWED_ORIGINS,
) -> None:
    """Raise AuthError unless the request is authentic, fresh and unreplayed."""
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms

    # A present Origin header means a browser sent this. Block DNS rebinding.
    if origin is not None and origin not in tuple(allowed_origins):
        raise AuthError("forbidden_origin")
    if not token:
        raise AuthError("missing_token")

    claims = decode_token(token)
    required = ("method", "path", "bodyHash", "nonce", "expiresAt", "signature")
    if not all(key in claims for key in required):
        raise AuthError("malformed_token")

    expires_at = claims["expiresAt"]
    if not isinstance(expires_at, int):
        raise AuthError("malformed_token")
    if expires_at < now_ms:
        raise AuthError("expired")
    if str(claims["method"]).upper() != method.upper():
        raise AuthError("method_mismatch")
    if claims["path"] != path:
        raise AuthError("path_mismatch")
    if claims["bodyHash"] != sha256_hex(body):
        raise AuthError("body_mismatch")

    expected = sign(secret, canonical(claims["method"], claims["path"], claims["bodyHash"], claims["nonce"], expires_at))
    if not hmac.compare_digest(str(claims["signature"]), expected):
        raise AuthError("bad_signature")

    if not nonces.check(str(claims["nonce"]), expires_at, now_ms):
        raise AuthError("replayed_nonce")


def make_token(secret: str, method: str, path: str, body: str = "", nonce: str = "n1", now_ms: int | None = None) -> str:
    """Client-side helper, used by tests and by the Rust core's HTTP calls."""
    now_ms = int(time.time() * 1000) if now_ms is None else now_ms
    expires_at = now_ms + TOKEN_TTL_MS
    body_hash = sha256_hex(body)
    claims = {
        "method": method.upper(),
        "path": path,
        "bodyHash": body_hash,
        "nonce": nonce,
        "expiresAt": expires_at,
        "signature": sign(secret, canonical(method, path, body_hash, nonce, expires_at)),
    }
    return base64.b64encode(json.dumps(claims).encode("utf-8")).decode("ascii")
