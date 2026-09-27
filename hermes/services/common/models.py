"""Shared wire models. Field names match the TypeScript types exactly."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

Language = Literal["en", "ja", "fa"]
Emotion = Literal["neutral", "happy", "sad", "angry", "surprised", "relaxed", "thinking"]
RiskLevel = Literal["SAFE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]


class ToolDeclaration(BaseModel):
    name: str
    description: str
    risk: RiskLevel
    parameters: dict[str, Any] = Field(default_factory=dict)


class AgentMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str
    name: str | None = None
    toolCallId: str | None = None


class ToolCall(BaseModel):
    callId: str
    tool: str
    args: dict[str, Any] = Field(default_factory=dict)


class CompleteRequest(BaseModel):
    messages: list[AgentMessage]
    availableTools: list[ToolDeclaration] = Field(default_factory=list)
    language: Language = "en"
    provider: str = "mock"


class AgentStep(BaseModel):
    kind: Literal["final", "tool", "verify"]
    text: str | None = None
    thought: str | None = None
    emotion: Emotion = "neutral"
    calls: list[ToolCall] = Field(default_factory=list)


class VoiceParams(BaseModel):
    baseVoice: str = "voice_01"
    gender: Literal["feminine", "masculine", "neutral"] = "neutral"
    pitch: float = 0.5
    speed: float = 1.0
    energy: float = 0.5
    softness: float = 0.5
    warmth: float = 0.5
    deepness: float = 0.3
    maturity: float = 0.5
    cuteness: float = 0.5
    expressiveness: float = 0.6
    japaneseInfluence: float = 0.0
    animeStyle: float = 0.0


class SynthesiseRequest(BaseModel):
    text: str
    language: Language = "en"
    emotion: Emotion = "neutral"
    voice: VoiceParams = Field(default_factory=VoiceParams)
    provider: str = "mock"


class Viseme(BaseModel):
    viseme: str
    tMs: int
    weight: float


class SynthesiseResponse(BaseModel):
    audioBase64: str | None = None
    format: str = "wav"
    durationMs: int = 0
    visemes: list[Viseme] = Field(default_factory=list)
    unsupportedParams: list[str] = Field(default_factory=list)
    provider: str = "mock"
