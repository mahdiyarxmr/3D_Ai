"""LLM provider interface.

Adding OpenAI, Ollama, llama.cpp or anything else means implementing this one
class. Nothing in the agent loop changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from ...common.models import AgentStep, CompleteRequest


class LlmProvider(ABC):
    id: str = "base"

    #: Whether using this provider sends prompts off the machine. The UI shows
    #: a cloud badge and the privacy settings can block it outright.
    is_cloud: bool = False

    @abstractmethod
    async def complete(self, request: CompleteRequest) -> AgentStep:
        """Produce the next agent step."""

    async def close(self) -> None:
        return None


_REGISTRY: dict[str, type[LlmProvider]] = {}


def register(provider: type[LlmProvider]) -> type[LlmProvider]:
    _REGISTRY[provider.id] = provider
    return provider


def create(provider_id: str) -> LlmProvider:
    if provider_id not in _REGISTRY:
        raise KeyError(f"unknown LLM provider: {provider_id}")
    return _REGISTRY[provider_id]()


def available() -> list[str]:
    return sorted(_REGISTRY)
