# LunaAI Web API (v1)

Base path: `/api`. Authentication: `Authorization: Bearer <jwt>` on every endpoint except
registration, login and health. Responses are JSON; the chat endpoint streams `text/event-stream`.

A machine-readable description lives in [packages/shared-contracts/api-v1.openapi.json](../packages/shared-contracts/api-v1.openapi.json).

> LunaAI PC exposes **no HTTP API**. It is a single local process; its UI and agent communicate in
> memory. There is no localhost port to call, and nothing in this document grants desktop access.

## Health

```
GET /api/health
200 {"ok":true,"product":"LunaAI Web","apiVersion":"v1","provider":"echo","toolsEnabled":false}
```

`provider` is `echo` when no provider key is configured, which means responses come from the
labelled development provider.

## Authentication

```
POST /api/auth/register   {"email","name","password"}   -> 201 {"user":{...},"token":"..."}
POST /api/auth/login      {"email","password"}          -> 200 {"user":{...},"token":"..."}
GET  /api/auth/me                                       -> 200 {"user":{...}}
```

Errors: `400 invalid_input`, `401 invalid_credentials`, `409 email_taken`, `429 rate_limited`.
Passwords must be 8–200 characters; hashes are never returned.

## Conversations

```
GET    /api/conversations                -> {"conversations":[{"id","title","created_at","updated_at","message_count"}]}
POST   /api/conversations {"title"?}     -> 201 {"conversation":{...}}
GET    /api/conversations/:id            -> {"conversation":{...},"messages":[{"id","role","content","created_at"}]}
PATCH  /api/conversations/:id {"title"}  -> {"conversation":{...}}
DELETE /api/conversations/:id            -> 204
GET    /api/conversations/search?q=term  -> {"results":[{"id","title","snippet","snippet_role"}]}
```

Every query is scoped to the authenticated user. Requesting another user's conversation returns
`404 not_found`.

## Chat (streaming)

```
POST /api/conversations/:id/messages   {"content":"message"}
200 text/event-stream
```

Events:

| Event | Data | Meaning |
| --- | --- | --- |
| `delta` | `{"text":"…"}` | Incremental assistant text. |
| `tool` | `{"name":"calculate","status":"ok","result":{…}}` or `{"name":"…","status":"denied","reason":"tool_not_allowlisted"}` | A server-side tool ran or was blocked by policy. |
| `done` | `{"content":"full text","aborted":false}` | Stream finished; the assistant message has been stored. |
| `error` | `{"error":"provider_error"}` | The provider failed; the stream ends and the API stays available. |

Aborting the HTTP request cancels the provider call. Message content is limited to 32 000
characters.

## Settings

```
GET /api/settings  -> {"settings":{"language":"en|ja|fa","theme":"system|light|dark"}}
PUT /api/settings  {"language"?,"theme"?}  -> {"settings":{...}}
```

## Server-side tools

```
GET /api/tools -> {"enabled":false,"scope":"server","tools":[{"name":"calculate","description":"…","risk":"low","scope":"server","allowlisted":false}]}
```

Read-only. The catalogue can only ever contain server-scoped tools; the registry rejects any tool
name that names a computer-control capability, and an empty allow list means every tool is blocked
until the deployment opts in.

## Error codes

| HTTP | `error` | Localization key used by the client |
| --- | --- | --- |
| 400 | `invalid_input` | `error.invalid_input` |
| 401 | `unauthorized`, `invalid_token`, `invalid_credentials` | `error.unauthorized`, `error.invalid_credentials` |
| 404 | `not_found` | `error.not_found` |
| 409 | `email_taken` | `error.email_taken` |
| 429 | `rate_limited` | `error.rate_limited` |
| 500 | `internal_error` | `error.server` |

The client maps codes through `apps/web/frontend/src/i18n.ts`, so messages are localized in
English, Japanese and Persian without the server knowing the user's language.
