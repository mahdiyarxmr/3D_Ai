# VRM character companion (planned)

A VRM avatar companion is an optional future feature of LunaAI PC. It is **not implemented**; the
controls do not exist yet and nothing in this repository pretends otherwise.

## Why it is not built yet

VRM rendering needs a 3D capable renderer inside the native desktop application. The mandatory
technology restriction forbids web-based rendering, so the options are:

1. A native 3D pipeline (for example a WPF-hosted Direct3D/WPF interop surface) with a VRM loader
   written against the glTF/VRM specification, or
2. A separate, optionally installed companion process that renders the avatar and communicates with
   the desktop application over a local, authenticated channel, with the primary interface remaining
   native.

Option 1 keeps everything in one native process and is the preferred direction. It is a substantial
piece of work (glTF parsing, skinning, spring-bone physics, blendshape animation) and is therefore
sequenced after the agent, permission and privacy foundations, which are the parts that carry risk.

## Constraints that will apply when it is built

* Character assets are untrusted input: they must be validated and must never be executed as code.
* Avatar animation must not bypass the permission manager; expression and lip-sync triggers are UI
  events, not computer actions.
* Voice profiles declare which languages they support; the interface language and the conversation
  language stay independent settings.
* No avatar asset is uploaded anywhere without an explicit user action.
