# Character Profiles

A character profile connects:

- VRM model
- display name
- personality
- voice
- languages
- accent/style
- default emotions
- animation preferences

Example:

{
  "id": "sakura",
  "name": "Sakura",
  "vrm": "characters/sakura/character.vrm",
  "personality": {
    "cute": 0.82,
    "playful": 0.76,
    "confident": 0.35
  },
  "voice": "sakura-voice",
  "languages": ["en", "ja", "fa"],
  "default_language": "en",
  "accent": {
    "japanese_influence": 0.68,
    "anime_style": 0.76
  }
}

Characters must be independent from the global application language.
