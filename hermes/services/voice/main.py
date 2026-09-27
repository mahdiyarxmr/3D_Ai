"""Voice service: TTS synthesis, provider capability reporting, STT (TODO)."""

from __future__ import annotations

from fastapi import HTTPException

from ..common.app import create_app
from ..common.models import SynthesiseRequest, SynthesiseResponse
from .providers.base import ALL_PARAMS
from .providers.mock_tts import MockTtsProvider

app = create_app("hermes-voice")

TTS_PROVIDERS = {MockTtsProvider.id: MockTtsProvider()}


@app.get("/providers")
async def providers() -> dict:
    return {
        "tts": [
            {
                "id": provider.id,
                "isCloud": provider.is_cloud,
                "languages": sorted(provider.languages()),
                "supports": sorted(provider.capabilities()),
                "ignores": sorted(ALL_PARAMS - provider.capabilities()),
            }
            for provider in TTS_PROVIDERS.values()
        ],
        # TODO: register an STT provider (faster-whisper) — see docs/TASKS.md.
        "stt": [],
    }


@app.post("/synthesise", response_model=SynthesiseResponse)
async def synthesise(request: SynthesiseRequest) -> SynthesiseResponse:
    provider = TTS_PROVIDERS.get(request.provider)
    if provider is None:
        raise HTTPException(status_code=404, detail=f"unknown TTS provider: {request.provider}")
    if request.language not in provider.languages():
        raise HTTPException(status_code=422, detail=f"{provider.id} cannot speak {request.language}")
    return await provider.synthesise(request)


@app.post("/preview", response_model=SynthesiseResponse)
async def preview(request: SynthesiseRequest) -> SynthesiseResponse:
    return await synthesise(request)


@app.post("/transcribe")
async def transcribe() -> dict:
    # TODO: wire faster-whisper. Returns 501 rather than a fake transcript so
    # callers cannot mistake a stub for a working STT.
    raise HTTPException(status_code=501, detail="no STT provider is configured")
