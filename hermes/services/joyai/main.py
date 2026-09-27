"""JoyAI adapter.

JoyAI is an OPTIONAL video subsystem. HERMES must never depend on it, so this
adapter is a separate process that the desktop app probes and degrades away
from when absent. Nothing in the base application imports this module.
"""

from __future__ import annotations

import os

import httpx
from fastapi import HTTPException
from pydantic import BaseModel

from ..common.app import create_app

app = create_app("hermes-joyai")

JOYAI_UPSTREAM = os.environ.get("JOYAI_UPSTREAM")  # e.g. http://127.0.0.1:9100


class TransformRequest(BaseModel):
    inputPath: str
    style: str
    outputPath: str


@app.get("/status")
async def status() -> dict:
    """Probed by the desktop app. Always answers; never raises."""
    if not JOYAI_UPSTREAM:
        return {"installed": False, "reason": "JOYAI_UPSTREAM is not configured"}
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{JOYAI_UPSTREAM}/health")
        return {"installed": response.status_code == 200, "upstream": JOYAI_UPSTREAM}
    except httpx.HTTPError as exc:
        return {"installed": False, "reason": str(exc)}


@app.post("/transform")
async def transform(request: TransformRequest) -> dict:
    if not JOYAI_UPSTREAM:
        raise HTTPException(status_code=503, detail="JoyAI is not installed")
    async with httpx.AsyncClient(timeout=None) as client:
        response = await client.post(f"{JOYAI_UPSTREAM}/transform", json=request.model_dump())
    if response.status_code >= 400:
        raise HTTPException(status_code=response.status_code, detail=response.text)
    return response.json()
