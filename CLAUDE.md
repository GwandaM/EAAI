# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Enterprise AI Agent backend: a NestJS service that exposes `POST /agent/chat`, runs an
agent loop on AWS Bedrock (Claude 3.5 Sonnet) via the Vercel AI SDK, and streams responses
using the **UI Message Stream protocol** so a `useChat()` frontend renders tokens + tool
calls incrementally. Three live tools: Bedrock Knowledge Base retriever, a Company REST API,
and a PostgreSQL sales query.

This is a **pnpm workspace**. The NestJS backend is the root package; the Next.js frontend
lives in `frontend/` (separate package `enterprise-ai-agent-frontend`).

## Commands

Backend (run from repo root):

```bash
pnpm install                # install all workspace deps
pnpm run start:dev          # NestJS watch mode (http://localhost:3000)
pnpm run build              # nest build -> dist/
pnpm run start:prod         # node dist/main.js
pnpm run typecheck          # tsc --noEmit
pnpm run lint               # eslint {src,test}/**/*.ts --fix
pnpm run format             # prettier --write
pnpm test                   # jest (unit, *.spec.ts under src/)
pnpm run test:e2e           # jest --config test/jest-e2e.json
pnpm run smoke:prod         # scripts/smoke-prod.mjs — hits /health + frontend proxy
```

Run a single test:

```bash
pnpm test -- src/tools/database/database.service.spec.ts   # one file
pnpm test -- -t "falls back to mock"                       # by test name
```

Frontend (proxied scripts from root, or run inside `frontend/`):

```bash
pnpm run frontend:dev       # next dev
pnpm run frontend:build
pnpm run frontend:lint
pnpm run frontend:typecheck
```

To run both locally, set the proxy target so the Next API route forwards to Nest:

```bash
BACKEND_CHAT_URL=http://127.0.0.1:3000/agent/chat pnpm run frontend:dev -- --hostname 127.0.0.1 --port 3001
```

Docker: `docker compose up --build` brings up Postgres (with healthcheck) + the app on `:3000`.

## Architecture

Request flow: `agent.controller.ts` (`POST /agent/chat`) → `AgentService.streamChat` →
`streamText` with the three tools and `stopWhen: stepCountIs(5)` → tool `execute` calls →
`pipeUIMessageStreamToResponse(res)` writes SSE-style deltas the frontend `useChat` parses.

Module wiring (`app.module.ts`): `ConfigModule` (global) → `LlmModule` (global) → `ToolsModule`
→ `AgentModule` → `HealthModule`. Each tool has a paired `*.service.ts` (does the I/O) and
`*.tool.ts` (Zod schema + AI SDK tool definition); the service is injected into the tool builder.

### Conventions specific to this codebase

- **AI SDK "loose typing" wrappers.** The `ai` package's exports are cast through
  `as unknown as (...)` adapters rather than used with their native generics: `streamTextLoose`
  / `stepCountIsLoose` in `agent.service.ts`, `defineAgentTool` in `tools/ai-tool.ts`, and the
  `convertToModelMessages` cast in `normalizeMessages`. This is intentional insulation from the
  SDK's volatile generic signatures — preserve it. Do **not** "fix" the `unknown` types into the
  SDK's real types; that reintroduces the coupling these wrappers exist to avoid.
- **Tools never throw.** Every `execute` returns through `wrapToolResult(name, fn)`
  (`tools/tool-result.ts`), yielding `{ ok: true, data } | { ok: false, error }`. The agent
  loop and the model both depend on this — a failed tool must not 500 the request. New tools
  must follow this pattern and the model is instructed (system prompt) to handle `ok=false`.
- **Fail-fast config.** `validateEnv` (Zod, `config/env.validation.ts`) runs inside
  `ConfigModule.load` at boot, so bad env vars crash before the server binds. `buildAppConfig`
  produces the typed `AppConfig` (`config/configuration.ts`) — read config only via
  `ConfigService<AppConfig, true>` with `{ infer: true }`, never raw `process.env`.
- **The Bedrock model is a DI token.** `bedrock.provider.ts` exposes `BEDROCK_MODEL` (a
  `Symbol`) via a `useFactory` provider using `fromNodeProviderChain()` for credentials. Inject
  it with `@Inject(BEDROCK_MODEL)`. The model id is pinned in `configuration.ts`
  (`BEDROCK_MODEL_ID = anthropic.claude-3-5-sonnet-20241022-v2:0`).
- **Graceful degradation.** `DatabaseService` works with no `DATABASE_URL` (returns
  deterministic mock rows) and also falls back to mock if the `sales_performance` table is
  missing (`42P01`). SQL uses parameterized values; the `metric` column name is injected only
  after enum validation (defence-in-depth).

### Error handling layers

| Layer | Behaviour |
|---|---|
| Tool `execute` throws | `wrapToolResult` → `{ ok: false, error }`; model recovers |
| `streamText` runtime error | `onError` logs; `pipeUIMessageStreamToResponse({ onError })` emits a safe error event |
| DTO validation | Global `ValidationPipe` (whitelist + transform) → 400 before the service |
| Other thrown errors | `common/filters/all-exceptions.filter.ts` — JSON 5xx, or clean close if already streaming |
| Process-level | `unhandledRejection` handler in `main.ts` logs without crashing |

### Frontend proxy

`frontend/app/api/chat/route.ts` (Node runtime) proxies `POST /api/chat` to `BACKEND_CHAT_URL`,
streaming `upstream.body` through and copying only stream-relevant headers. Returns 503 if
`BACKEND_CHAT_URL` is unset. The browser can instead call a backend directly via
`NEXT_PUBLIC_CHAT_API_URL`.

## Config reference

Env vars are validated at boot; see `.env.example`. `AWS_REGION` is required. Credentials use
the standard AWS chain (env → `~/.aws/credentials` → instance role), so the explicit
`AWS_ACCESS_KEY_ID`/`SECRET` are optional. `DATABASE_URL`, `BEDROCK_KNOWLEDGE_BASE_ID`,
`COMPANY_API_TOKEN` are optional but tools degrade/fail without real values.
