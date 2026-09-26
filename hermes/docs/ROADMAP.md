# Roadmap

Status tracked against [MVP.md](MVP.md) and [TASKS.md](TASKS.md).

## 0.1 — MVP (Phase 1, current)

| Item                            | State |
| ------------------------------- | ----- |
| Windows desktop app             | 🔨 written, not yet compiled |
| VRM upload / render             | ✅ |
| Transparent floating character  | 🔨 configured, needs the native build |
| Smooth idle animation           | ✅ |
| English / Japanese / Persian UI | ✅ |
| RTL Persian                     | ✅ |
| Chat                            | ✅ |
| Microphone                      | ⬜ |
| STT                             | ⬜ interfaces only, returns 501 |
| TTS                             | 🟡 interfaces + working mock |
| Male/female voice profiles      | ✅ |
| Voice personality controls      | ✅ defined effects, capability-reported |
| Japanese-inspired voice style   | ✅ specified and mapped |
| Emotion-driven speech           | ✅ |
| Lip sync                        | 🟡 text-driven; audio-driven pending |
| Screenshot                      | ✅ |
| Mouse / keyboard                | ✅ |
| Filesystem tools                | ✅ |
| CMD / PowerShell                | ✅ |
| Permission levels               | ✅ |
| Audit log                       | ✅ |
| Emergency stop                  | ✅ |

**To close 0.1:** compile the Rust crate on Windows, add faster-whisper STT and
Piper TTS, connect audio-driven lip sync.

## 0.2 — perception and persistence

- Vision model and local OCR
- Windows UI Automation for reliable element targeting
- Browser automation
- Persistent memory
- Long-running tasks, planning, interruption and resumption

## 0.3 — expression

- JoyAI integration proper
- Webcam and video tools
- Advanced avatar expressions
- Plugin system

## 1.0

- Multiple characters
- Local and cloud model providers, switchable at runtime
- Advanced memory
- Voice import / marketplace
- Scheduler
- Plugin SDK
- Advanced agent policies

## Ordering principle

Perception before autonomy. Expanding what the agent may do, before improving
how well it understands what it is looking at, produces a confident agent that
clicks the wrong thing. 0.2 is deliberately about seeing, not about new powers.
