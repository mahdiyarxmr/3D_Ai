"""The agent service must route intents and stay inside the tool contract."""

from __future__ import annotations

import pytest

from services.agent.providers import base as provider_base
from services.agent.providers.mock import MockProvider
from services.common.models import AgentMessage, CompleteRequest, ToolDeclaration
from services.computer.contract import TOOL_CAPABILITIES, TOOL_IDS

TOOLS = [
    ToolDeclaration(name=name, description="", risk="SAFE", parameters={})
    for name in ("computer.screenshot", "system.info", "system.processes", "applications.list_windows")
]


def request(text: str, language: str = "en", tools=TOOLS) -> CompleteRequest:
    return CompleteRequest(messages=[AgentMessage(role="user", content=text)], availableTools=tools, language=language)


@pytest.mark.asyncio
async def test_routes_a_screenshot_intent_to_the_screenshot_tool() -> None:
    step = await MockProvider().complete(request("can you take a screenshot?"))
    assert step.kind == "tool"
    assert step.calls[0].tool == "computer.screenshot"


@pytest.mark.asyncio
async def test_never_calls_a_tool_that_was_not_offered() -> None:
    step = await MockProvider().complete(request("take a screenshot", tools=[]))
    assert step.kind == "final"


@pytest.mark.asyncio
async def test_summarises_once_a_tool_result_is_present() -> None:
    step = await MockProvider().complete(
        CompleteRequest(
            messages=[
                AgentMessage(role="user", content="take a screenshot"),
                AgentMessage(role="tool", name="computer.screenshot", content='{"ok":true,"summary":"captured 2560x1440"}'),
            ],
            availableTools=TOOLS,
        )
    )
    assert step.kind == "final"
    assert "captured" in (step.text or "")


@pytest.mark.asyncio
@pytest.mark.parametrize(("language", "marker"), [("en", "mock provider"), ("ja", "モック"), ("fa", "آزمایشی")])
async def test_greets_in_the_conversation_language(language: str, marker: str) -> None:
    step = await MockProvider().complete(request("hello", language=language))
    assert step.kind == "final"
    assert marker in (step.text or "")


@pytest.mark.asyncio
async def test_only_ever_emits_known_tool_ids() -> None:
    provider = MockProvider()
    for prompt in ["screenshot", "which windows are open", "system info", "list processes", "hello"]:
        step = await provider.complete(request(prompt))
        for call in step.calls:
            assert call.tool in TOOL_IDS


def test_the_registry_exposes_the_mock_provider() -> None:
    assert "mock" in provider_base.available()
    assert isinstance(provider_base.create("mock"), MockProvider)


def test_unknown_providers_raise_rather_than_silently_falling_back() -> None:
    with pytest.raises(KeyError):
        provider_base.create("definitely-not-a-provider")


def test_every_tool_has_a_capability() -> None:
    assert all(TOOL_CAPABILITIES[tool] for tool in TOOL_IDS)
