"""TTS/STT provider interfaces and the voice-parameter mapping contract.

The point of `capabilities()` is honesty: the UI greys out a slider the active
provider cannot honour instead of letting the user drag something that does
nothing.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ...common.models import SynthesiseRequest, SynthesiseResponse

#: Every tunable voice parameter, matching packages/shared/src/character.ts.
ALL_PARAMS: frozenset[str] = frozenset(
    {
        "baseVoice",
        "gender",
        "pitch",
        "speed",
        "energy",
        "softness",
        "warmth",
        "deepness",
        "maturity",
        "cuteness",
        "expressiveness",
        "japaneseInfluence",
        "animeStyle",
    }
)


class TtsProvider(ABC):
    id: str = "base"
    is_cloud: bool = False

    @abstractmethod
    def capabilities(self) -> frozenset[str]:
        """Which of ALL_PARAMS this provider actually honours."""

    @abstractmethod
    def languages(self) -> frozenset[str]:
        """BCP-47 language subtags this provider can synthesise."""

    @abstractmethod
    async def synthesise(self, request: SynthesiseRequest) -> SynthesiseResponse:
        ...

    def unsupported(self, request: SynthesiseRequest) -> list[str]:
        """Parameters the caller set that this provider will ignore."""
        supported = self.capabilities()
        defaults = type(request.voice)()
        changed = {
            name
            for name in ALL_PARAMS
            if getattr(request.voice, name, None) != getattr(defaults, name, None)
        }
        return sorted(changed - supported)


class SttProvider(ABC):
    id: str = "base"
    is_cloud: bool = False

    @abstractmethod
    def languages(self) -> frozenset[str]:
        ...

    @abstractmethod
    async def transcribe(self, audio: bytes, language: str) -> str:
        ...


def derive_composites(voice) -> dict[str, float]:  # type: ignore[no-untyped-def]
    """Resolve composite parameters into primitive synthesis controls.

    `cuteness`, `animeStyle`, `maturity` and `japaneseInfluence` are not
    primitives any engine understands — they are documented combinations of
    pitch, rate, formant shift and prosody range. Defining that mapping here,
    once, is what stops them from being decorative sliders.
    """
    pitch = voice.pitch
    rate = voice.speed
    formant = -voice.deepness * 0.6
    prosody = voice.expressiveness

    # Cuteness: higher pitch, slightly faster, brighter formants, more contour.
    pitch += voice.cuteness * 0.22
    rate *= 1.0 + voice.cuteness * 0.06
    formant += voice.cuteness * 0.3
    prosody += voice.cuteness * 0.15

    # Maturity pulls in the opposite direction from cuteness.
    pitch -= voice.maturity * 0.18
    formant -= voice.maturity * 0.25
    prosody -= voice.maturity * 0.1

    # Anime style: exaggerated contour and sharper onsets.
    prosody += voice.animeStyle * 0.35
    attack = 0.5 + voice.animeStyle * 0.4 - voice.softness * 0.35

    return {
        "pitch": _clamp(pitch, 0.0, 1.0),
        "rate": _clamp(rate, 0.5, 2.0),
        "formantShift": _clamp(formant, -1.0, 1.0),
        "prosodyRange": _clamp(prosody, 0.0, 1.5),
        "attack": _clamp(attack, 0.0, 1.0),
        "breathiness": _clamp(voice.softness * 0.8, 0.0, 1.0),
        "gain": _clamp(0.4 + voice.energy * 0.6, 0.0, 1.0),
        "lowMidGain": _clamp(voice.warmth, 0.0, 1.0),
        "moraTiming": _clamp(voice.japaneseInfluence, 0.0, 1.0),
    }


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
