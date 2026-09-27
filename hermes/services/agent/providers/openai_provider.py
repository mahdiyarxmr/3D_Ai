"""OpenAI provider.

Not imported by default: `services/agent/main.py` imports it lazily so the base
install has no `openai` dependency. Enabling it also requires
`privacy.allowCloudLlm` — the desktop app refuses to select a cloud provider
otherwise.
"""

from __future__ import annotations

import json
import os

from ...common.models import AgentStep, CompleteRequest, ToolCall
from .base import LlmProvider, register


@register
class OpenAiProvider(LlmProvider):
    id = "openai"
    is_cloud = True

    def __init__(self) -> None:
        try:
            from openai import AsyncOpenAI  # noqa: PLC0415 - intentionally lazy
        except ImportError as exc:  # pragma: no cover - depends on optional extra
            raise RuntimeError("pip install openai to use the OpenAI provider") from exc

        # The key comes from the OS keychain via the Rust core, never from a
        # settings file. HERMES_OPENAI_API_KEY is injected into the sidecar's
        # environment at spawn time.
        key = os.environ.get("HERMES_OPENAI_API_KEY")
        if not key:
            raise RuntimeError("HERMES_OPENAI_API_KEY is not set")
        self._client = AsyncOpenAI(api_key=key)
        self._model = os.environ.get("HERMES_OPENAI_MODEL", "gpt-4o-mini")

    async def complete(self, request: CompleteRequest) -> AgentStep:
        tools = [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": f"[risk: {tool.risk}] {tool.description}",
                    "parameters": tool.parameters or {"type": "object", "properties": {}},
                },
            }
            for tool in request.availableTools
        ]

        response = await self._client.chat.completions.create(
            model=self._model,
            messages=[self._to_wire(m) for m in request.messages],
            tools=tools or None,
            tool_choice="auto" if tools else None,
        )
        choice = response.choices[0].message

        if choice.tool_calls:
            return AgentStep(
                kind="tool",
                thought=choice.content or "Calling a tool.",
                calls=[
                    ToolCall(
                        callId=call.id,
                        tool=call.function.name,
                        args=json.loads(call.function.arguments or "{}"),
                    )
                    for call in choice.tool_calls
                ],
            )

        return AgentStep(kind="final", text=choice.content or "", emotion="neutral")

    @staticmethod
    def _to_wire(message) -> dict:  # type: ignore[no-untyped-def]
        if message.role == "tool":
            return {
                "role": "tool",
                "content": message.content,
                "tool_call_id": message.toolCallId or "unknown",
            }
        return {"role": message.role, "content": message.content}

    async def close(self) -> None:
        await self._client.close()
