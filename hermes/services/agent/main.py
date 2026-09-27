"""Agent service.

Exposes the LLM provider layer over an authenticated local HTTP API. The
*loop* (observe -> reason -> plan -> permission -> execute -> verify) lives in
the desktop app, because only the desktop app can prompt the user for
confirmation. This service is deliberately just the reasoning step.
"""

from __future__ import annotations

import logging

from ..common.app import create_app
from ..common.models import AgentStep, CompleteRequest
from .providers import base as provider_base
from .providers import mock  # noqa: F401 - registers the mock provider

log = logging.getLogger("hermes.agent")

app = create_app("hermes-agent")


@app.get("/providers")
async def providers() -> dict[str, list[str]]:
    return {"providers": provider_base.available()}


@app.post("/complete", response_model=AgentStep)
async def complete(request: CompleteRequest) -> AgentStep:
    try:
        provider = provider_base.create(request.provider)
    except KeyError:
        if request.provider == "openai":
            from .providers import openai_provider  # noqa: F401, PLC0415 - lazy optional import

            provider = provider_base.create("openai")
        else:
            raise

    try:
        return await provider.complete(request)
    finally:
        await provider.close()
