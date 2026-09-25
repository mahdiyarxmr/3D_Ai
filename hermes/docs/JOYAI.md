# JoyAI Integration

JoyAI-Video-Edit is an optional visual/video subsystem.

Do NOT make the base HERMES application depend on JoyAI.

Recommended architecture:

HERMES
  |
  +--> JoyAI adapter
          |
          v
      isolated service
          |
       FastAPI/WebSocket or equivalent
          |
       GPU/model runtime

Potential future features:
- video transformation
- webcam effects
- stylized video
- desktop/video processing

JoyAI should be independently installable because model/GPU requirements can be significantly larger than the base assistant.
