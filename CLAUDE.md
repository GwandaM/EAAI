# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Invest Broker Agent backend: a NestJS service that exposes `POST /agent/chat` behind a
JWT guard, runs an agent loop on AWS Bedrock (Claude 3.5 Sonnet) via the Vercel AI SDK
v6, and streams responses using the **UI Message Stream protocol** so a `useChat()`
frontend renders tokens + tool calls incrementally. The model-facing tools are Party
Service (12 tools), Policy Service (12 tools), a Bedrock Knowledge Base retriever
(`queryKnowledgeBase`), and two visualization tools (`presentChart`/`presentDiagram`).
The visualization tools are validate-and-echo: they Zod-validate a declarative spec
(Recharts-style chart data or Mermaid source) and return it in the tool result; the
frontend renders those tool parts as actual components (`frontend/components/
agent-chart.tsx`, `agent-diagram.tsx`). PostgreSQL is used only for conversation-history
persistence (`persistence/`), never as a model-facing data tool.

This is an **npm workspace**: the NestJS backend in `backend/`
(`enterprise-ai-agent-backend`), the Next.js frontend in `frontend/`
(`enterprise-ai-agent-frontend`), and a pure-orchestrator root (no source) holding
`docker-compose.yml`, `scripts/`, and proxy scripts in the root `package.json`.

## Commands

Run both servers together (backend `:3005` + frontend `:3001`, wired via `scripts/dev.mjs`):

```bash
npm run dev
```

Backend (root scripts proxy to the `backend` package via npm workspaces):

```bash
npm install                 # install all workspace deps
npm run start:dev           # NestJS watch mode (http://localhost:3005)
npm test                    # jest (unit, *.spec.ts under backend/src/)
npm run test:e2e            # jest --config backend/test/jest-e2e.json
npm run smoke:prod          # scripts/smoke-prod.mjs — hits /health + frontend proxy
```

> **Known issue — `npm run typecheck` and `npm run build` crash.** The TypeScript
> compiler runs out of heap (~2 GB) checking the backend. This pre-dates the
> `agent-tools/` reorganization and is isolated to the tool factory files — suspected
> Zod `.passthrough()` schema inference × AI SDK `tool()` generics across the 24 API
> tools. Dev mode and Jest are unaffected (they transpile without the full check).
> Do not claim the backend typechecks. The frontend typecheck is fast and must stay
> that way — see the `agent-tools/ui.ts` rule below.

Run a single test (from `backend/`, so Jest arg pass-through is clean):

```bash
cd backend
npm test -- src/agent-tools/visualization.spec.ts          # one file
npm test -- -t "presentChart"                              # by test name
```

Frontend:

```bash
npm run frontend:dev        # next dev
npm run frontend:build
npm run frontend:lint
npm run frontend:typecheck
```

`npm run dev` already wires `BACKEND_CHAT_URL` so the Next API route forwards to Nest.

Docker: `docker compose up --build` brings up Postgres (with healthcheck) + the app on
`:3005`. Build context is the repo root with `dockerfile: backend/Dockerfile`
(npm-workspace build). Env comes from `backend/.env`.

## Architecture

Request flow: frontend `useChat()` (typed as `AgentUIMessage`) → Next.js
`frontend/app/api/chat/route.ts` proxy (streams the body through, forwards the caller's
`Authorization` bearer) → `chat/chat.controller.ts` (`POST /agent/chat`, `JwtAuthGuard`)
→ `AgentService.streamChat` → `streamText` with the full tool set and
`stopWhen: stepCountIs(10)` → `pipeUIMessageStreamToResponse(res)`. When the request
carries a `conversationId`, both turns are persisted (best-effort, never blocks the
stream) and an LLM-generated title is attached to the conversation after the first
exchange.

Module wiring (`app.module.ts`): `ConfigModule` (global) → `AuthModule` →
`PersistenceModule` (global, provides `HistoryService`) → `ToolsModule` → `AgentModule`
→ `ChatModule` → `HistoryModule` → `HealthModule`. `LoggingMiddleware`
(`common/logging.middleware.ts`) logs every request.

### The tool contract: `backend/src/agent-tools/`

Everything in this folder is **framework-free** (no NestJS imports) and is the
shared contract between backend, and frontend:

- `party-schemas.ts` / `policy-schemas.ts` — Zod schemas that are the **source of
  truth for the upstream API shapes**. Responses are parsed through them
  (`.passthrough()`, so unexpected fields are kept) before reaching the model.
- `party.ts` / `policy.ts` / `knowledge-base.ts` / `visualization.ts` — pure
  factories (`create*Tools(baseUrl, headers)`) defining AI SDK `tool()` objects.
- `http.ts` — shared `fetchJson` helper (non-OK responses throw).
- `index.ts` — composition root: `createTools(config)` assembles the full `ToolSet`;
  `ToolScope`/`buildScopeHeaders` define the per-user scope headers.
- `ui.ts` — the **frontend type contract** (`AgentUIMessage`). Its import graph must
  stay tiny (visualization only): inferring UI types across the 24 API tools blows up
  tsc, and a wider graph risks dragging server code toward the client bundle.

The only NestJS-aware piece is `tools/tools.service.ts`, which binds validated
`AppConfig` (base URLs, bearer token, KB id/region) plus the per-user scope headers to
`createTools`. Adding a tool domain = new `<domain>-schemas.ts` + `<domain>.ts` factory
+ one spread in `createTools`.

The frontend imports the contract **type-only** through the `@backend/*` tsconfig
alias (`import type { AgentUIMessage } from '@backend/agent-tools/ui'`). An ESLint
rule (`@typescript-eslint/no-restricted-imports` with `allowTypeImports`) blocks value
imports — a value import would ship the AWS SDK and bearer-token fetch helpers to the
browser.

### Conventions specific to this codebase

- **Native AI SDK usage.** `streamText`, `generateText`, `stepCountIs`,
  `convertToModelMessages` and `tool()` are used with their real types — no cast
  wrappers. The one deliberate type-narrowing: factory results are widened to
  `ToolSet` *before* spreading in `createTools`, and `ToolsService.createTools`
  returns `ToolSet`, because letting tsc infer the union of 27 tool generics
  exhausts its heap.
- **Tool error semantics differ by family — keep them.**
  - Party/Policy tools **throw** (non-OK HTTP, Zod parse failure). The AI SDK turns a
    thrown `execute` into a tool-error part; the model sees it and recovers — the
    request never 500s.
  - `queryKnowledgeBase` soft-fails: returns `retrievalStatus: "unavailable"` with an
    empty result list.
  - Visualization tools return `{ ok: true, data } | { ok: false, error }`. This
    envelope is **load-bearing**: the frontend renders only `output.ok === true`
    parts, and `AgentService.persistableParts` uses the same check to decide what
    survives a reload. Do not "simplify" it away.
- **Fail-fast config.** `validateEnv` (Zod, `config/env.validation.ts`) runs at boot;
  bad env crashes before the server binds. Read config only via
  `ConfigService<AppConfig, true>` with `{ infer: true }` — never raw `process.env`,
  never raw string keys. The shared upstream bearer token is `BEARER_TOKEN`
  (`COMPANY_API_TOKEN` is a legacy alias; `BEARER_TOKEN` wins if both are set).
- **The model is a plain factory.** `agent/agent.constants.ts` exposes
  `createModel(region, modelId)` (standard AWS credential chain) plus
  `SYSTEM_PROMPT` and `MAX_AGENT_STEPS` (10). The default model id is pinned in
  `config/configuration.ts`; `BEDROCK_MODEL_ID` overrides it (cross-region inference
  profile ids like `eu.anthropic.…` are required in many regions).
- **No model-facing SQL.** Only named business tools may be registered in
  `createTools`. Add Party/Policy service endpoints + schemas instead, so
  authorization stays behind the business API.
- **Server-owned prompt and scope.** `ChatRequestDto` accepts no `system` override.
  `AgentService.toolScope` derives `ToolScope` from verified JWT claims and
  `buildScopeHeaders` turns it into `X-Authenticated-User-Id`/`X-Broker-Id`/… headers
  on every upstream call. Never let the model supply user, broker, or party scope.

### Error handling layers

| Layer | Behaviour |
|---|---|
| Party/Policy tool throws | AI SDK emits a tool-error part; system prompt tells the model to explain and continue |
| Knowledge-base unavailable | Tool returns `retrievalStatus: "unavailable"` (soft-fail envelope) |
| Visualization spec invalid | `{ ok: false, error }` result; model can correct and retry |
| `streamText` runtime error | `onError` logs; `pipeUIMessageStreamToResponse({ onError })` emits a safe error event (real cause shown outside production) |
| DTO validation | Global `ValidationPipe` (whitelist + transform) → 400 before the service |
| Other thrown errors | `common/filters/all-exceptions.filter.ts` — JSON 5xx, or clean close if already streaming |
| Process-level | `unhandledRejection` handler in `main.ts` logs without crashing |

### Frontend proxy

`frontend/app/api/chat/route.ts` (Node runtime) proxies `POST /api/chat` to
`BACKEND_CHAT_URL` (dev fallback `http://localhost:3005/agent/chat`), streaming
`upstream.body` through, copying only stream-relevant headers, and forwarding the
caller's `Authorization` header for the backend's `JwtAuthGuard`.
`frontend/app/api/history/[...path]/route.ts` proxies the history API the same way.
The browser can instead call a backend directly via `NEXT_PUBLIC_CHAT_API_URL`.

## Config reference

Env vars are validated at boot; see `backend/.env.example`. `AWS_REGION`,
`BEDROCK_KNOWLEDGE_BASE_ID`, `POLICY_SERVICE_BASE_URL`, and `PARTY_SERVICE_BASE_URL`
are required — the Policy and Party services live on different base URLs but share one
bearer token (`BEARER_TOKEN`, legacy alias `COMPANY_API_TOKEN`; optional when the
upstreams need no auth). AWS credentials use the standard chain (env →
`~/.aws/credentials` → instance role). `DATABASE_URL` is optional and only controls
chat-history persistence. Auth: `AUTH_JWKS_URI` is required unless
`AUTH_DISABLED=true` (local dev).
