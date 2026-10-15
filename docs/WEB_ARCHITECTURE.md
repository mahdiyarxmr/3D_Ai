# LunaAI Web architecture

LunaAI Web is a multi-user assistant hosted on your servers and used from a browser. It has no
capability to reach a user's computer.

## Components

```
Browser (React + TypeScript + Vite)
        │  HTTPS, relative /api paths only
        ▼
Reverse proxy / TLS terminator  (deployment specific)
        │
        ▼
LunaAI Web API  (Node.js 20+, Express 4, apps/web/backend)
        ├── auth      JWT bearer tokens, bcrypt password hashes
        ├── data      SQLite (better-sqlite3) with per-user ownership in every query
        ├── providers IChatProvider-compatible abstraction over OpenAI-style HTTP endpoints
        └── tools     server-scoped tool registry with an explicit allow-list policy
        │
        ▼
AI provider (remote HTTP API) — receives only conversation messages and tool definitions
```

The frontend is a separate deployable artifact (`npm run build` produces static files). It talks to
the API over the same origin using relative `/api` paths; the Vite dev server and the production
reverse proxy forward those requests. The browser is never configured with a backend hostname, so no
build can accidentally point a user at `localhost`.

## Request flow for a chat turn

1. The client `POST`s a message to `/api/conversations/:id/messages` with its bearer token.
2. `requireAuth` resolves the user id from the signed token — never from the request body.
3. The message is validated (`zod`) and stored.
4. The route opens an SSE stream and asks the provider to generate a response.
5. Provider chunks are forwarded as `delta` events as they arrive; tool calls are collected.
6. Each tool call is authorised by the server-side tool policy before execution. Denials emit a
   `tool` event with `status: "denied"` and are written to the audit table.
7. The final assistant text is stored and a `done` event closes the stream.

Cancellation: the client aborts the request, the server aborts the provider call and stops writing.
Errors are reported as an `error` event instead of breaking the connection contract.

## Data ownership and isolation

The schema (`apps/web/backend/src/db.js`) stores `users`, `conversations`, `messages`,
`user_settings` and `audit_events`. Every conversation query includes `user_id = ?`, and lookups of
another user's conversation return **404** rather than 403 so that ids cannot be probed. Settings and
search results are equally user-scoped. `tests/isolation.test.js` covers reads, writes, renames,
deletes, search and settings.

Deploying for several tenants means one database per tenant or an added `tenant_id` column in every
table plus the same ownership predicate in every query.

## Authentication and abuse protection

* Passwords: bcrypt with cost 12; hashes are never returned by the API.
* Sessions: JWT (`HS256`, configurable lifetime). `JWT_SECRET` is mandatory when
  `NODE_ENV=production`; the service refuses to start without it.
* Rate limiting: a fixed-window limiter per IP for all `/api` routes plus a stricter bucket for
  registration and login. In-memory state means a multi-instance deployment must move the counters to
  a shared store (Redis) — this is required before horizontal scaling, and is listed in
  `docs/ROADMAP.md`.
* Input validation: every request body and query is parsed with `zod`; message size, email format,
  language and theme values are constrained.

## Provider layer

`src/providers/index.js` exposes `createProvider(config)`, which returns either:

* `OpenAICompatibleProvider` — streams from any endpoint that implements
  `POST {baseUrl}/chat/completions` with `stream: true`, using `fetch` and parsing SSE frames, or
* the deterministic development provider used when no key is configured. It is labelled as a
  development provider in `/api/health` (`provider: "echo"`) and the UI shows a notice, so a
  key-less deployment can never look like a real model.

Provider keys live only on the server (`OPENAI_API_KEY`), are never sent to clients and are never
included in responses, logs or the audit trail.

## Server-side tools

`src/tools/registry.js` accepts a tool only when it is explicitly `scope: "server"` and its name does
not contain any computer-control marker (`shell`, `filesystem`, `mouse`, `screenshot`, `desktop`, …).
Registration of a privileged capability therefore throws. `src/tools/policy.js` authorises each
invocation: tools are off unless `ENABLE_SERVER_TOOLS=true`, and `SERVER_TOOL_ALLOWLIST` narrows the
catalogue further. Two tools ship today: `server_time` and `calculate` (a hand-written arithmetic
parser — no dynamic evaluation). `/api/tools` exposes the catalogue, read-only, to authenticated
users.

## What LunaAI Web deliberately does not have

No shell or command execution, no file-system access, no screen capture, no input control, no
application or window control, no remote-control endpoint for a PC, and no shared privileged service
with LunaAI PC. Uploaded files are treated as data belonging to that one conversation; the original
path on the user's disk is neither requested nor stored.

## Deployment notes

* Run the API behind TLS; terminate certificates at the reverse proxy.
* Set `JWT_SECRET`, `CORS_ORIGINS`, `DB_PATH` and provider variables as environment variables.
* Serve the built frontend from the same origin as the API so that relative paths and CORS stay
  simple.
* Back up the SQLite file (or migrate to a server database) and keep `audit_events` for compliance.

Repository guards (`tests/separation.test.mjs`) fail the build if web production code ever mentions a
desktop capability or exposes a privileged endpoint, so the separation is enforced in CI, not only in
review.
