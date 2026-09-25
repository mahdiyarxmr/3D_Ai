# Local API

Suggested endpoints:

GET  /api/status
GET  /api/character
POST /api/character
GET  /api/characters
POST /api/characters
GET  /api/permissions
POST /api/permissions
GET  /api/tools
POST /api/tools/execute
GET  /api/voice/profiles
POST /api/voice/profiles
POST /api/voice/preview
POST /api/vision/screenshot

WebSocket:
- /ws/chat
- /ws/agent
- /ws/events
- /ws/audio

Events:
agent.started
agent.thinking
agent.tool.started
agent.tool.completed
agent.permission.required
agent.completed
agent.interrupted
voice.started
voice.chunk
voice.completed
avatar.expression
avatar.animation
