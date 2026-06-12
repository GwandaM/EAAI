/**
 * Frontend-facing type contract for the agent's UI Message Stream.
 *
 * The frontend imports this module **type-only** (`import type { ... } from
 * '@backend/agent-tools/ui'`) so `useChat()` knows the shape of the tool
 * parts it renders. Keep this file's import graph tiny: it must only reach
 * the visualization factory, never the API tool factories — both so nothing
 * server-side can leak into the client bundle, and because inferring UI types
 * across all 24 zod-typed API tools exhausts the TypeScript compiler's heap.
 */
import type { InferUITools, UIDataTypes, UIMessage } from 'ai';

import type { createVisualizationTools } from './visualization';

export type { ChartInput, ChartSpec, DiagramInput, DiagramSpec } from './visualization';

/**
 * The tool parts the UI renders as components (presentChart/presentDiagram).
 * Other tool calls (policy/party/knowledge-base lookups) stream through as
 * generic tool parts and are shown with a neutral progress indicator.
 */
export type AgentUITools = InferUITools<ReturnType<typeof createVisualizationTools>>;

/** The UIMessage shape streamed by POST /agent/chat and consumed by useChat(). */
export type AgentUIMessage = UIMessage<unknown, UIDataTypes, AgentUITools>;
