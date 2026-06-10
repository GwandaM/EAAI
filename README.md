# Invest Broker Agent (EAAI) — NestJS Backend

Production-ready NestJS backend for an Invest Broker Agent. Powered by the
Vercel AI SDK, AWS Bedrock (`Claude 3.5 Sonnet`), and three tool domains:
Policy Service tools, Party Service tools, and a Bedrock Knowledge Base
retriever.

Streams responses using the **Vercel AI UI Message Stream protocol**, so
the frontend can drop in `useChat({ api: '/agent/chat' })` and render
tokens + tool calls incrementally.

---

## 1. Install

```bash
npm install
```

This is an npm workspace. The NestJS backend is in `backend/` and the
Next.js frontend is in `frontend/`.

## 2. Configure

```bash
cp backend/.env.example backend/.env
# fill in AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# BEDROCK_KNOWLEDGE_BASE_ID, COMPANY_API_BASE_URL, COMPANY_API_TOKEN,
# DATABASE_URL (optional — chat history is disabled if unset).
```

All env vars are validated at boot by a Zod schema in
`src/config/env.validation.ts`. Missing or malformed values cause the
process to exit **before** the HTTP server starts.

## 3. Run

### Local

```bash
npm run start:dev
```

Run the frontend in a second terminal:

```bash
BACKEND_CHAT_URL=http://127.0.0.1:3000/agent/chat npm run frontend:dev -- --hostname 127.0.0.1 --port 3001
```

### Docker (with Postgres)

```bash
docker compose up --build
```

This brings up `postgres` (with healthcheck) and the `app` service on
`http://localhost:3000`.

## 4. Trigger from the frontend

### `curl` smoke test (no frontend required)

```bash
curl -N -X POST http://localhost:3000/agent/chat \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "What does our leave policy say about carryover?"}'
```

You should see a stream of UI Message Stream events:
- `data: ` lines containing JSON-encoded text deltas
- tool-call and tool-result events as the agent decides to call
  Policy Service, Party Service, or `queryKnowledgeBase` tools
- a final `finish` event

The Next.js App Router frontend lives in `frontend/` and uses
`@ai-sdk/react`. By default it posts to `/api/chat`; set `BACKEND_CHAT_URL` so
the Next.js API route can proxy that request to the Nest backend. You can also
set `NEXT_PUBLIC_CHAT_API_URL` to call another endpoint directly from the
browser.

## 5. Test each tool independently (tool harness CLI)

Every agent tool can be invoked directly from the terminal — no model, no HTTP
server, no frontend. The harness (`backend/src/cli/tools-cli.ts`) boots the real
DI container, builds the **same tool objects the agent uses** (via
`src/tools/agent-tools.ts`), validates your input with the same Zod schema the
model is held to, and prints the `{ ok, data | error }` envelope the model
would receive.

### Step 1 — make sure `backend/.env` is valid

The CLI runs the same fail-fast env validation as the server, so
`AWS_REGION`, `BEDROCK_KNOWLEDGE_BASE_ID`, and `COMPANY_API_BASE_URL` must be
set. You only need *reachable* services for the tools you actually run:

| Tool group | Needs |
|---|---|
| Policy / Party tools | `COMPANY_API_BASE_URL` pointing at a running business API |
| `queryKnowledgeBase` | Valid AWS credentials + `BEDROCK_KNOWLEDGE_BASE_ID` |
| `oracle.query` (dev-only) | `ORACLE_USER`, `ORACLE_PASSWORD`, `ORACLE_CONNECT_STRING` |

### Step 2 — see what tools exist

```bash
npm run tools -- list
```

Prints all 26 tools (12 Policy Service, 12 Party Service, `queryKnowledgeBase`,
and the dev-only `oracle.query`) with their descriptions.

### Step 3 — inspect a tool's input schema

```bash
npm run tools -- describe getWithdrawals
```

```
getWithdrawals
  Get policy withdrawals from the Policy Service, optionally filtered by date range.

  Input fields:
    policyId: string (required) — The policy identifier.
    fromDate: string (optional) — Optional inclusive start date.
    toDate: string (optional) — Optional inclusive end date.
```

### Step 4 — run it with your test input

```bash
npm run tools -- run getPolicy --args '{"policyId":"P-1001"}'
```

The result is always the envelope the model sees:

```jsonc
// success
{ "ok": true, "data": { ... } }

// failure (upstream down, bad id, not authorized, ...)
{ "ok": false, "error": "fetch failed" }
```

If your `--args` don't satisfy the schema, you get the exact Zod rejection the
model would get — useful for checking that a schema actually blocks bad input:

```bash
npm run tools -- run getWithdrawals --args '{"fromDate":"2026-01-01"}'
# Invalid args for getWithdrawals:
#   - policyId: Required
```

### Step 5 — test authorization scoping

Policy/Party tools receive a server-built `BusinessToolContext`. The CLI lets
you set it per call, so you can replay the same query as different brokers and
confirm the business API scopes results correctly:

```bash
npm run tools -- run searchBrokerClients --args '{"query":"smith"}' --broker BRK-001
npm run tools -- run searchBrokerClients --args '{"query":"smith"}' --broker BRK-002
```

Flags: `--user <id>` (default `cli-dev-user`), `--email`, `--broker`, `--party`.

### Step 6 — example per tool domain

```bash
# Policy Service
npm run tools -- run getPolicyValues --args '{"policyId":"P-1001"}'
npm run tools -- run searchPolicies --args '{"query":"retirement annuity"}'

# Party Service
npm run tools -- run getParty --args '{"partyId":"C-2002"}'
npm run tools -- run getAumSummary --args '{}' --broker BRK-001

# Knowledge base (hits AWS Bedrock for real)
npm run tools -- run queryKnowledgeBase --args '{"searchPhrase":"withdrawal rules","maxResults":3}'

# Oracle (dev-only; never exposed to the model)
npm run tools -- run oracle.query --args '{"sql":"SELECT * FROM policies WHERE policy_id = :id","binds":{"id":"P-1001"}}'
```

### Step 7 — scripting and expected-result checks

`--json` prints only the raw result, and the exit code reflects the outcome
(`0` = `ok:true`, `1` = `ok:false` or invalid args, `2` = usage error):

```bash
npm run tools -- run getPolicy --args '{"policyId":"P-1001"}' --json > actual.json
diff expected.json actual.json && echo "matches"
```

> Note: on a non-zero exit, npm appends a `Lifecycle script failed` trailer
> after the result — that's npm, not the tool. The JSON above it is the output.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `Invalid environment configuration: COMPANY_API_BASE_URL: Required` | `backend/.env` is missing a required var — the server would fail boot the same way |
| `{ "ok": false, "error": "fetch failed" }` | Business API at `COMPANY_API_BASE_URL` is unreachable |
| `Oracle is not configured. Set ORACLE_USER...` | `ORACLE_*` env vars unset — expected unless you're testing `oracle.query` |
| `Unknown tool "..."` | Check spelling against `npm run tools -- list` |

## 6. Project layout

```
src/
  main.ts                          NestJS bootstrap, ValidationPipe, CORS, exception filter
  app.module.ts                    Root module — wires Config/Llm/Tools/Agent
  config/
    env.validation.ts              Zod schema validating process.env on boot
    configuration.ts               Typed AppConfig + EU Claude 3.5 Sonnet profile ID
  llm/
    bedrock.provider.ts            createAmazonBedrock(...) -> LanguageModel provider
    llm.module.ts                  @Global() module exporting BEDROCK_MODEL token
  agent/
    agent.controller.ts            POST /agent/chat (streams UI Message events)
    agent.service.ts               streamText(...) orchestrator
    dto/chat-request.dto.ts        class-validator DTO for { messages | prompt }
    agent.module.ts
  cli/
    tools-cli.ts                   Tool harness CLI (npm run tools -- ...)
    tools-cli.module.ts            Slim DI context: config + tools, no HTTP/LLM
  tools/
    agent-tools.ts                 buildAgentTools — the model-facing tool registry
    tool-result.ts                 wrapToolResult — never throw; return { ok, data | error }
    business-api/                  REST client with timeout + authenticated scope headers
    knowledge-base/                Bedrock KB RetrieveCommand
    policy/                        Policy Service tools (.service.ts I/O + .tool.ts schema)
    party/                         Party Service tools (.service.ts I/O + .tool.ts schema)
    oracle/                        Read-only Oracle service — CLI dev-only, never model-facing
    tools.module.ts
  persistence/                     Optional Postgres chat-history (DATABASE_URL)
  common/
    filters/all-exceptions.filter.ts  Stream-aware global error handler
```

## 7. Error handling at a glance

| Layer | What happens on failure |
|---|---|
| Tool `execute` throws | `wrapToolResult` catches, returns `{ ok: false, error }` — model sees and recovers |
| `streamText` runtime error | `onError` logs; UI stream emits a safe error event via `pipeUIMessageStreamToResponse({ onError })` |
| DTO / validation | Global `ValidationPipe` rejects with 400 before reaching the service |
| Any other thrown error | `AllExceptionsFilter` logs and either sends JSON 5xx or, for already-streaming responses, closes cleanly |
| Process-level | `unhandledRejection` handler in `main.ts` logs without crashing |

## 8. How the agent loop works (AI SDK v5)

1. Client `POST /agent/chat` with `{ messages: UIMessage[] }` (or `{ prompt }`).
2. `AgentService` converts to `ModelMessage[]` via `convertToModelMessages`.
3. `streamText` is called with Policy, Party, and `queryKnowledgeBase` tools,
   plus `stopWhen: stepCountIs(5)`.
4. Model emits text + optional tool calls. SDK validates tool args with the
   tool's zod `inputSchema` and invokes `execute`.
5. Tool returns `{ ok: true, data }` or `{ ok: false, error }` (never throws).
6. SDK sends the tool result back to the model. Loop continues up to 5 steps.
7. All deltas — text, tool calls, tool results, finish — are piped to the
   Express response via `pipeUIMessageStreamToResponse`. `useChat` parses
   them automatically on the frontend.
