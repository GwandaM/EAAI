# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Invest Broker Agent backend: a NestJS service that exposes `POST /agent/chat`, runs an
agent loop on AWS Bedrock (Claude 3.5 Sonnet) via the Vercel AI SDK, and streams responses
using the **UI Message Stream protocol** so a `useChat()` frontend renders tokens + tool
calls incrementally. Active model-facing tools are grouped into Policy Service, Party
Service, and Bedrock Knowledge Base domains. PostgreSQL is used only for
conversation-history persistence (`persistence/`), not as a model-facing data tool.

This is an **npm workspace** with two packages: the NestJS backend in `backend/`
(`enterprise-ai-agent-backend`) and the Next.js frontend in `frontend/`
(`enterprise-ai-agent-frontend`). The repo root is a pure orchestrator (no source),
holding `docker-compose.yml`, `scripts/`, and a root `package.json` whose scripts
proxy into the packages via npm workspaces.

## Commands

Run both servers together (backend `:3000` + frontend `:3001`, wired via `scripts/dev.mjs`):

```bash
npm run dev
```

Backend (root scripts proxy to the `backend` package via npm workspaces):

```bash
npm install                 # install all workspace deps
npm run start:dev           # NestJS watch mode (http://localhost:3000)
npm run build               # nest build -> backend/dist/
npm run start:prod          # node backend/dist/main.js
npm run typecheck           # tsc --noEmit
npm run lint                # eslint {src,test}/**/*.ts --fix
npm test                    # jest (unit, *.spec.ts under backend/src/)
npm run test:e2e            # jest --config backend/test/jest-e2e.json
npm run test:bedrock        # gated real-Bedrock integration test (needs RUN_BEDROCK_INTEGRATION=true + AWS creds)
npm run smoke:prod          # scripts/smoke-prod.mjs — hits /health + frontend proxy
npm run tools               # tool harness CLI: list | describe <tool> | run <tool> --args '<json>'
```

The tool harness CLI (`backend/src/cli/tools-cli.ts`) invokes any model-facing tool
directly — no model, no HTTP server. It builds tools through the same
`buildAgentTools` registry (`tools/agent-tools.ts`) the agent uses, validates args
against the same Zod schemas, and prints the `{ ok, ... }` envelope. `--user/--broker/--party`
flags set the `BusinessToolContext`. `oracle.query` is exposed here as dev-only and must
stay out of `buildAgentTools` (no model-facing SQL). Exit codes: 0 ok, 1 failure, 2 usage.

Run a single test (from `backend/`, so Jest arg pass-through is clean):

```bash
cd backend
npm test -- src/tools/policy/policy.tool.spec.ts           # one file
npm test -- -t "server-side context"                       # by test name
```

Frontend (proxied scripts from root, or run inside `frontend/`):

```bash
npm run frontend:dev        # next dev
npm run frontend:build
npm run frontend:lint
npm run frontend:typecheck
```

`npm run dev` already wires `BACKEND_CHAT_URL` so the Next API route forwards to Nest.

Docker: `docker compose up --build` brings up Postgres (with healthcheck) + the app on `:3000`.
The build context is the repo root with `dockerfile: backend/Dockerfile` (an npm-workspace
build using `npm ci`). Env comes from `backend/.env`.

## Architecture

Request flow: `agent.controller.ts` (`POST /agent/chat`) → `AgentService.streamChat` →
`streamText` with Policy, Party, and `queryKnowledgeBase` tools plus
`stopWhen: stepCountIs(5)` → tool `execute` calls →
`pipeUIMessageStreamToResponse(res)` writes SSE-style deltas the frontend `useChat` parses.

Module wiring (`app.module.ts`): `ConfigModule` (global) → `LlmModule` (global) → `ToolsModule`
→ `AgentModule` → `HealthModule`. Policy/Party tools have paired `*.service.ts` files
(business API I/O) and `*.tool.ts` files (Zod schema + AI SDK tool definition). The
`business-api/` client adds authenticated user/broker scope headers to every upstream call.

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
  (`BEDROCK_MODEL_ID = eu.anthropic.claude-3-5-sonnet-20241022-v2:0`).
- **No model-facing SQL.** The active agent must expose named business tools only. Do not
  register generic SQL/database/query tools in `AgentService`; add Policy or Party service
  methods instead so authorization and relationship checks stay behind the business API.
- **Server-owned prompt and scope.** `ChatRequestDto` does not accept a `system` override.
  `AgentService` builds `BusinessToolContext` from the authenticated user/JWT claims and passes
  it into the Policy/Party tool builders. Do not ask the model to provide user, broker, or party
  scope.

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

Env vars are validated at boot; see `backend/.env.example`. `AWS_REGION`,
`BEDROCK_KNOWLEDGE_BASE_ID`, `POLICY_SERVICE_BASE_URL`, and `PARTY_SERVICE_BASE_URL` are
required — the Policy and Party services live on different base URLs but share one bearer
token. Credentials use the standard AWS chain (env → `~/.aws/credentials` → instance role),
so explicit `AWS_ACCESS_KEY_ID`/`SECRET` are optional. `DATABASE_URL` is optional and only
controls chat history persistence. `COMPANY_API_TOKEN` (the shared bearer token) is optional
when the upstream services do not require bearer auth.
