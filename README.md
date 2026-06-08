# Enterprise AI Agent (EAAI) — NestJS Backend

Production-ready NestJS backend for an enterprise AI agent. Powered by the
Vercel AI SDK (`ai@5`), AWS Bedrock (`Claude 3.5 Sonnet`), and three live
tools: a Bedrock Knowledge Base retriever, a Company REST API, and a
PostgreSQL query tool.

Streams responses using the **Vercel AI UI Message Stream protocol**, so
the frontend can drop in `useChat({ api: '/agent/chat' })` and render
tokens + tool calls incrementally.

---

## 1. Install

```bash
pnpm install
```

This is a pnpm workspace. The NestJS backend is the root package and the
Next.js frontend is in `frontend/`.

## 2. Configure

```bash
cp .env.example .env
# fill in AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
# BEDROCK_KNOWLEDGE_BASE_ID, COMPANY_API_BASE_URL, COMPANY_API_TOKEN,
# DATABASE_URL (optional — mock data is used if unset).
```

All env vars are validated at boot by a Zod schema in
`src/config/env.validation.ts`. Missing or malformed values cause the
process to exit **before** the HTTP server starts.

## 3. Run

### Local

```bash
pnpm run start:dev
```

Run the frontend in a second terminal:

```bash
BACKEND_CHAT_URL=http://127.0.0.1:3000/agent/chat pnpm run frontend:dev -- --hostname 127.0.0.1 --port 3001
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
  -d '{"prompt": "What were Q3 sales in EMEA?"}'
```

You should see a stream of UI Message Stream events:
- `data: ` lines containing JSON-encoded text deltas
- tool-call and tool-result events as the agent decides to call
  `searchKnowledgeBase`, `getCompanyProduct`, or `querySalesPerformance`
- a final `finish` event

The Next.js App Router frontend lives in `frontend/` and uses
`@ai-sdk/react`. By default it posts to `/api/chat`; set `BACKEND_CHAT_URL` so
the Next.js API route can proxy that request to the Nest backend. You can also
set `NEXT_PUBLIC_CHAT_API_URL` to call another endpoint directly from the
browser.

## 5. Project layout

```
src/
  main.ts                          NestJS bootstrap, ValidationPipe, CORS, exception filter
  app.module.ts                    Root module — wires Config/Llm/Tools/Agent
  config/
    env.validation.ts              Zod schema validating process.env on boot
    configuration.ts               Typed AppConfig + Claude 3.5 Sonnet model ID
  llm/
    bedrock.provider.ts            createAmazonBedrock(...) -> LanguageModel provider
    llm.module.ts                  @Global() module exporting BEDROCK_MODEL token
  agent/
    agent.controller.ts            POST /agent/chat (streams UI Message events)
    agent.service.ts               streamText(...) orchestrator
    dto/chat-request.dto.ts        class-validator DTO for { messages | prompt }
    agent.module.ts
  tools/
    tool-result.ts                 wrapToolResult — never throw; return { ok, data | error }
    knowledge-base/                Bedrock KB RetrieveCommand
    company-api/                   REST fetch with timeout
    database/                      pg.Pool with mock fallback
    tools.module.ts
  common/
    filters/all-exceptions.filter.ts  Stream-aware global error handler
```

## 6. Error handling at a glance

| Layer | What happens on failure |
|---|---|
| Tool `execute` throws | `wrapToolResult` catches, returns `{ ok: false, error }` — model sees and recovers |
| `streamText` runtime error | `onError` logs; UI stream emits a safe error event via `pipeUIMessageStreamToResponse({ onError })` |
| DTO / validation | Global `ValidationPipe` rejects with 400 before reaching the service |
| Any other thrown error | `AllExceptionsFilter` logs and either sends JSON 5xx or, for already-streaming responses, closes cleanly |
| Process-level | `unhandledRejection` handler in `main.ts` logs without crashing |

## 7. How the agent loop works (AI SDK v5)

1. Client `POST /agent/chat` with `{ messages: UIMessage[] }` (or `{ prompt }`).
2. `AgentService` converts to `ModelMessage[]` via `convertToModelMessages`.
3. `streamText` is called with the three tools and `stopWhen: stepCountIs(5)`.
4. Model emits text + optional tool calls. SDK validates tool args with the
   tool's zod `inputSchema` and invokes `execute`.
5. Tool returns `{ ok: true, data }` or `{ ok: false, error }` (never throws).
6. SDK sends the tool result back to the model. Loop continues up to 5 steps.
7. All deltas — text, tool calls, tool results, finish — are piped to the
   Express response via `pipeUIMessageStreamToResponse`. `useChat` parses
   them automatically on the frontend.
