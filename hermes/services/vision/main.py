"""Vision service: screenshot analysis and OCR.

Status: interface only. Every endpoint returns 501 rather than fabricating a
result — a vision stub that invents UI elements would make the agent take
actions based on fiction.
"""

from __future__ import annotations

from fastapi import HTTPException
from pydantic import BaseModel

from ..common.app import create_app

app = create_app("hermes-vision")


class AnalyseRequest(BaseModel):
    imageBase64: str
    question: str | None = None
    language: str = "en"


@app.get("/providers")
async def providers() -> dict:
    return {"providers": [], "note": "no vision provider configured"}


@app.post("/analyse")
async def analyse(request: AnalyseRequest) -> dict:
    raise HTTPException(status_code=501, detail="no vision provider is configured")


@app.post("/ocr")
async def ocr(request: AnalyseRequest) -> dict:
    # TODO: rapidocr-onnxruntime, fully local. See docs/TASKS.md.
    raise HTTPException(status_code=501, detail="OCR is not implemented yet")
