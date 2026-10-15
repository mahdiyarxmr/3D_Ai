# Shared contracts

This package holds the **non-privileged** contracts that LunaAI Web and LunaAI PC may both consume.

## What may live here

* API request/response shapes for the LunaAI Web API (`api-v1.openapi.json`).
* Error-code vocabulary and its localization keys (`error-codes.json`).
* Localization file naming and key conventions.
* Provider request/response shapes that are identical in both products (`provider-chat.json`).

## What must never live here

* Any descriptor, schema or capability handle for acting on a user's device: no shell or command
  execution, no file-system access, no screen capture, no input control, no window or application
  control, and no permission-decision types that could be handed to the hosted service.
* Credentials, tokens, desktop secrets or anything that would let a web request reach a desktop
  capability.

`tests/separation.test.mjs` scans this package and fails the build if a privileged term appears, so
the rule is enforced rather than aspirational.
