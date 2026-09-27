"""Tool contract mirror.

The authoritative tool catalogue is packages/agent-protocol/src/tools.ts. This
module mirrors the ids and capabilities for Python-side consumers, and
tests/native-parity.test.ts parses this table alongside the Rust and
TypeScript catalogues and asserts all three agree, so a tool cannot end up
with a different capability in one language than another.
"""

from __future__ import annotations

TOOL_CAPABILITIES: dict[str, str] = {
    "computer.screenshot": "observe",
    "computer.mouse_move": "input",
    "computer.mouse_click": "input",
    "computer.mouse_scroll": "input",
    "computer.keyboard_type": "input",
    "computer.keyboard_press": "input",
    "computer.hotkey": "input",
    "filesystem.list": "fs.read",
    "filesystem.read": "fs.read",
    "filesystem.write": "fs.write",
    "filesystem.copy": "fs.write",
    "filesystem.move": "fs.write",
    "filesystem.delete": "fs.delete",
    "applications.open": "process",
    "applications.close": "process",
    "applications.focus": "process",
    "applications.list_windows": "observe",
    "shell.cmd": "shell",
    "shell.powershell": "shell",
    "system.info": "observe",
    "system.processes": "observe",
}

TOOL_IDS = tuple(sorted(TOOL_CAPABILITIES))
