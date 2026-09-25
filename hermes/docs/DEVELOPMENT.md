# Development

## Recommended stack

Desktop:
- Tauri
- React
- TypeScript

Native:
- Rust

AI/ML services:
- Python

VRM:
- Three.js + VRM ecosystem

Storage:
- SQLite

Transport:
- WebSocket + local IPC

## Development rules

- Run the desktop UI without AI services during UI development.
- Mock tool execution during UI tests.
- Mock TTS during avatar tests.
- Keep provider adapters isolated.
- Add unit tests for permission logic.
- Add integration tests for agent tool calls.
- Add end-to-end tests for character upload and language switching.
