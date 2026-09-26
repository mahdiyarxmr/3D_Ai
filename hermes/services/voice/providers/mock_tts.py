"""Offline TTS that produces a real, playable WAV.

It is a formant-ish tone generator, not a speech synthesiser — but it produces
genuine audio of the correct duration with a matching viseme schedule, so lip
sync, interruption and the audio pipeline can all be developed and tested
without downloading a model.
"""

from __future__ import annotations

import base64
import io
import math
import struct
import wave

from ...common.models import SynthesiseRequest, SynthesiseResponse, Viseme
from .base import TtsProvider, derive_composites

SAMPLE_RATE = 22_050
VOWELS = {
    "a": "aa", "i": "ih", "u": "ou", "e": "ee", "o": "oh",
    "あ": "aa", "い": "ih", "う": "ou", "え": "ee", "お": "oh",
    "ا": "aa", "آ": "aa", "و": "ou", "ی": "ih",
}


class MockTtsProvider(TtsProvider):
    id = "mock"
    is_cloud = False

    def capabilities(self) -> frozenset[str]:
        # Honest about being a toy: only the parameters that genuinely change
        # the output are reported as supported.
        return frozenset({"pitch", "speed", "energy", "expressiveness", "cuteness", "baseVoice", "gender"})

    def languages(self) -> frozenset[str]:
        return frozenset({"en", "ja", "fa"})

    async def synthesise(self, request: SynthesiseRequest) -> SynthesiseResponse:
        controls = derive_composites(request.voice)
        chars = max(1, len(request.text))
        duration_ms = int(chars / (12.0 * controls["rate"]) * 1000)
        duration_ms = max(300, min(duration_ms, 30_000))

        audio = self._render(duration_ms, controls, request.emotion)
        visemes = self._visemes(request.text, duration_ms)

        return SynthesiseResponse(
            audioBase64=base64.b64encode(audio).decode("ascii"),
            format="wav",
            durationMs=duration_ms,
            visemes=visemes,
            unsupportedParams=self.unsupported(request),
            provider=self.id,
        )

    def _render(self, duration_ms: int, controls: dict[str, float], emotion: str) -> bytes:
        base_hz = 110.0 + controls["pitch"] * 200.0
        if emotion in ("happy", "surprised"):
            base_hz *= 1.06
        elif emotion == "sad":
            base_hz *= 0.92

        total = int(SAMPLE_RATE * duration_ms / 1000)
        frames = bytearray()
        for n in range(total):
            t = n / SAMPLE_RATE
            # Syllable-rate amplitude envelope, so it looks like speech to the
            # lip-sync analyser rather than a flat tone.
            syllable = 0.5 + 0.5 * math.sin(2 * math.pi * 4.2 * t)
            contour = 1.0 + controls["prosodyRange"] * 0.25 * math.sin(2 * math.pi * 0.8 * t)
            fade = min(1.0, t * 20) * min(1.0, (duration_ms / 1000 - t) * 20)
            sample = (
                math.sin(2 * math.pi * base_hz * contour * t) * 0.55
                + math.sin(2 * math.pi * base_hz * 2 * contour * t) * 0.22
                + math.sin(2 * math.pi * base_hz * 3 * contour * t) * 0.1
            )
            value = int(sample * syllable * fade * controls["gain"] * 22_000)
            frames += struct.pack("<h", max(-32_768, min(32_767, value)))

        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(SAMPLE_RATE)
            handle.writeframes(bytes(frames))
        return buffer.getvalue()

    @staticmethod
    def _visemes(text: str, duration_ms: int) -> list[Viseme]:
        chars = list(text)
        if not chars:
            return []
        step = duration_ms / len(chars)
        out: list[Viseme] = []
        last = "sil"
        for index, char in enumerate(chars):
            at = int(index * step)
            viseme = VOWELS.get(char.lower())
            if viseme:
                out.append(Viseme(viseme=viseme, tMs=at, weight=0.65))
                last = viseme
            elif char.isspace() or char in ".,!?;:،。！？":
                if last != "sil":
                    out.append(Viseme(viseme="sil", tMs=at, weight=0.0))
                    last = "sil"
            elif last != "sil":
                out.append(Viseme(viseme=last, tMs=at, weight=0.25))
        out.append(Viseme(viseme="sil", tMs=duration_ms, weight=0.0))
        return out
