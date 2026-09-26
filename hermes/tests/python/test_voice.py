"""Voice parameters must be real: they have to change the output."""

from __future__ import annotations

import base64
import io
import wave

import pytest

from services.common.models import SynthesiseRequest, VoiceParams
from services.voice.providers.base import ALL_PARAMS, derive_composites
from services.voice.providers.mock_tts import MockTtsProvider


@pytest.fixture
def provider() -> MockTtsProvider:
    return MockTtsProvider()


async def synth(provider: MockTtsProvider, **kwargs):
    request = SynthesiseRequest(text=kwargs.pop("text", "hello there"), **kwargs)
    return await provider.synthesise(request)


@pytest.mark.asyncio
async def test_produces_a_real_playable_wav(provider: MockTtsProvider) -> None:
    result = await synth(provider)
    audio = base64.b64decode(result.audioBase64 or "")
    with wave.open(io.BytesIO(audio), "rb") as handle:
        assert handle.getnchannels() == 1
        assert handle.getsampwidth() == 2
        assert handle.getnframes() > 1000


@pytest.mark.asyncio
async def test_speed_changes_the_duration(provider: MockTtsProvider) -> None:
    slow = await synth(provider, voice=VoiceParams(speed=0.6))
    fast = await synth(provider, voice=VoiceParams(speed=1.8))
    assert slow.durationMs > fast.durationMs * 1.5


@pytest.mark.asyncio
async def test_pitch_changes_the_waveform(provider: MockTtsProvider) -> None:
    low = await synth(provider, voice=VoiceParams(pitch=0.1))
    high = await synth(provider, voice=VoiceParams(pitch=0.9))
    assert low.audioBase64 != high.audioBase64


@pytest.mark.asyncio
async def test_reports_parameters_it_cannot_honour(provider: MockTtsProvider) -> None:
    # `deepness` is not in the mock's capability set, so the UI must be told.
    result = await synth(provider, voice=VoiceParams(deepness=0.95))
    assert "deepness" in result.unsupportedParams


@pytest.mark.asyncio
async def test_does_not_report_supported_parameters_as_unsupported(provider: MockTtsProvider) -> None:
    result = await synth(provider, voice=VoiceParams(pitch=0.9))
    assert "pitch" not in result.unsupportedParams


@pytest.mark.asyncio
async def test_visemes_cover_the_utterance(provider: MockTtsProvider) -> None:
    result = await synth(provider, text="hello there")
    assert result.visemes
    assert result.visemes[-1].viseme == "sil"
    times = [v.tMs for v in result.visemes]
    assert times == sorted(times)
    assert times[-1] <= result.durationMs


@pytest.mark.asyncio
@pytest.mark.parametrize("language", ["en", "ja", "fa"])
async def test_supports_all_three_mvp_languages(provider: MockTtsProvider, language: str) -> None:
    assert language in provider.languages()
    result = await synth(provider, language=language, text="こんにちは" if language == "ja" else "سلام" if language == "fa" else "hello")
    assert result.durationMs > 0


def test_capabilities_are_a_subset_of_the_known_parameters() -> None:
    assert MockTtsProvider().capabilities() <= ALL_PARAMS


class TestCompositeMapping:
    """Composite parameters must resolve to primitive synthesis controls."""

    def test_cuteness_raises_pitch_and_brightens_formants(self) -> None:
        plain = derive_composites(VoiceParams(cuteness=0.0))
        cute = derive_composites(VoiceParams(cuteness=1.0))
        assert cute["pitch"] > plain["pitch"]
        assert cute["formantShift"] > plain["formantShift"]

    def test_maturity_opposes_cuteness(self) -> None:
        young = derive_composites(VoiceParams(maturity=0.0))
        mature = derive_composites(VoiceParams(maturity=1.0))
        assert mature["pitch"] < young["pitch"]
        assert mature["formantShift"] < young["formantShift"]

    def test_anime_style_widens_prosody_and_sharpens_attack(self) -> None:
        plain = derive_composites(VoiceParams(animeStyle=0.0))
        anime = derive_composites(VoiceParams(animeStyle=1.0))
        assert anime["prosodyRange"] > plain["prosodyRange"]
        assert anime["attack"] > plain["attack"]

    def test_softness_reduces_attack_and_adds_breath(self) -> None:
        hard = derive_composites(VoiceParams(softness=0.0))
        soft = derive_composites(VoiceParams(softness=1.0))
        assert soft["attack"] < hard["attack"]
        assert soft["breathiness"] > hard["breathiness"]

    def test_deepness_lowers_formants(self) -> None:
        assert derive_composites(VoiceParams(deepness=1.0))["formantShift"] < derive_composites(VoiceParams(deepness=0.0))["formantShift"]

    def test_japanese_influence_maps_to_mora_timing(self) -> None:
        assert derive_composites(VoiceParams(japaneseInfluence=0.8))["moraTiming"] == pytest.approx(0.8)

    def test_all_outputs_stay_in_range(self) -> None:
        extreme = VoiceParams(
            pitch=1.0, speed=2.0, energy=1.0, softness=1.0, warmth=1.0,
            deepness=1.0, maturity=1.0, cuteness=1.0, expressiveness=1.0,
            japaneseInfluence=1.0, animeStyle=1.0,
        )
        controls = derive_composites(extreme)
        assert 0.0 <= controls["pitch"] <= 1.0
        assert 0.5 <= controls["rate"] <= 2.0
        assert -1.0 <= controls["formantShift"] <= 1.0
        assert 0.0 <= controls["attack"] <= 1.0

    def test_every_voice_parameter_is_either_primitive_or_composed(self) -> None:
        """No parameter may exist without a defined effect somewhere."""
        controls = set(derive_composites(VoiceParams()))
        # baseVoice/gender select the voice itself rather than shaping it.
        shaping = ALL_PARAMS - {"baseVoice", "gender"}
        defaults = VoiceParams()
        for name in shaping:
            nudged = VoiceParams(**{**defaults.model_dump(), name: 0.9 if name != "speed" else 1.9})
            assert derive_composites(nudged) != derive_composites(defaults), f"{name} has no effect"
        assert controls
