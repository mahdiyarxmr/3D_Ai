# Optional video/imaging subsystem integration

A separate, model-heavy video subsystem (referred to here as the optional video service) can be
attached to LunaAI PC for tasks such as video transformation or webcam stylisation. It is optional
and unimplemented today.

Boundary rules for when it is built:

* The base application must run with the subsystem absent. No feature in the permission manager,
  agent loop or UI may require it.
* It lives behind an adapter with a process boundary, because its GPU and model requirements are much
  larger than the base product's.
* Its service endpoint is local-only, authenticated, and not exposed on any public interface. The
  desktop application's rule of opening no listening port still applies to the base product, so any
  listener belongs to the optional service and must be documented as such.
* Requests that leave the computer (for example sending frames to a remote provider) are gated by the
  privacy settings and disclosed in the UI.
* Nothing in LunaAI Web may call it.
