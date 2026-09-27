# Services

Python sidecars for the parts of HERMES that genuinely need Python (model
runtimes, audio DSP, OCR). Everything else lives in Rust or TypeScript.

| Service    | Port | Status | Purpose                                            |
| ---------- | ---- | ------ | -------------------------------------------------- |
| `agent`    | 8731 | usable | LLM providers + the reason/plan loop                |
| `voice`    | 8732 | usable | STT/TTS provider interfaces, voice parameter mapping |
| `vision`   | 8733 | stub   | Screenshot analysis, OCR                            |
| `computer` | —    | lib    | Shared tool contract mirrored from TypeScript        |
| `joyai`    | 8734 | stub   | Optional video subsystem adapter                     |

HERMES runs **without any of these**: the desktop app defaults to the in-process
mock provider. They are opt-in from Settings → AI.

## Running

```bash
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn services.agent.main:app --port 8731 --host 127.0.0.1
```

Run from the `hermes/` directory so `services` resolves as a package.

## Authentication

Binding to 127.0.0.1 is not an authorisation boundary — every local process and
every web page can reach it. All services therefore require an HMAC-signed
`Authorization` header derived from the per-launch session secret written by
the Rust core to `storage/settings/session.json`. See `services/common/auth.py`
and `docs/SECURITY.md`.
