"""FastAPI application factory with the shared auth middleware."""

from __future__ import annotations

import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .auth import AuthError, NonceStore, load_session_secret, verify_request

# Endpoints reachable without a token. Deliberately tiny: health only, and it
# returns nothing sensitive.
PUBLIC_PATHS = {"/health", "/openapi.json", "/docs", "/redoc"}


def session_secret_path() -> Path:
    override = os.environ.get("HERMES_SESSION_FILE")
    if override:
        return Path(override)
    return Path(os.environ.get("HERMES_STORAGE", "storage")) / "settings" / "session.json"


def create_app(title: str, *, require_auth: bool = True) -> FastAPI:
    app = FastAPI(title=title, version="0.1.0", docs_url=None, redoc_url=None)
    app.state.nonces = NonceStore()
    app.state.require_auth = require_auth

    @app.middleware("http")
    async def authenticate(request: Request, call_next):  # type: ignore[no-untyped-def]
        if not app.state.require_auth or request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        try:
            secret = load_session_secret(session_secret_path())
        except (AuthError, OSError, ValueError):
            # No secret means the Rust core has not started. Fail closed.
            return JSONResponse({"error": "service_not_ready"}, status_code=503)

        body = (await request.body()).decode("utf-8")
        header = request.headers.get("authorization", "")
        token = header[7:] if header.lower().startswith("bearer ") else None

        try:
            verify_request(
                secret=secret,
                token=token,
                method=request.method,
                path=request.url.path,
                body=body,
                nonces=app.state.nonces,
                origin=request.headers.get("origin"),
            )
        except AuthError as exc:
            return JSONResponse({"error": exc.reason}, status_code=401)

        return await call_next(request)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": title}

    return app
