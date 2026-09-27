"""Offline provider that exercises the real loop without any model."""

from __future__ import annotations

from ...common.models import AgentStep, CompleteRequest, ToolCall
from .base import LlmProvider, register

GREETINGS = {
    "en": "I'm running on the mock provider. {count} tools are available to me.",
    "ja": "モックプロバイダーで動作中です。現在 {count} 個のツールが利用可能です。",
    "fa": "با ارائه‌دهنده آزمایشی کار می‌کنم. در حال حاضر {count} ابزار در دسترس است.",
}

INTENTS: list[tuple[tuple[str, ...], str, dict]] = [
    (("screenshot", "screen", "スクリーン", "صفحه"), "computer.screenshot", {"display": 0}),
    (("window", "ウィンドウ", "پنجره"), "applications.list_windows", {}),
    (("system", "cpu", "memory", "システム", "سیستم"), "system.info", {}),
    (("process", "プロセス", "پردازش"), "system.processes", {"limit": 25}),
]


@register
class MockProvider(LlmProvider):
    id = "mock"
    is_cloud = False

    _counter = 0

    async def complete(self, request: CompleteRequest) -> AgentStep:
        tool_messages = [m for m in request.messages if m.role == "tool"]
        if tool_messages:
            return AgentStep(
                kind="final",
                text=f"Done — {tool_messages[-1].content[:180]}",
                emotion="neutral",
            )

        user = next((m.content for m in reversed(request.messages) if m.role == "user"), "")
        goal = user.lower()
        available = {t.name for t in request.availableTools}

        for keywords, tool, args in INTENTS:
            if any(keyword in goal for keyword in keywords) and tool in available:
                MockProvider._counter += 1
                return AgentStep(
                    kind="tool",
                    thought=f"I should call {tool} to answer this.",
                    calls=[ToolCall(callId=f"call-{MockProvider._counter}", tool=tool, args=args)],
                )

        template = GREETINGS.get(request.language, GREETINGS["en"])
        return AgentStep(kind="final", text=template.format(count=len(available)), emotion="neutral")
