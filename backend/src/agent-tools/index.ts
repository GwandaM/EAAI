/**
 * Agent tool contract — the single composition root for every tool the agent
 * can call, plus the types the frontend imports for end-to-end typing.
 *
 * Everything under `agent-tools/` is framework-free (no NestJS): pure
 * factories the backend wires through DI (`tools/tools.service.ts`), the CLI
 * harness reuses directly, and the frontend imports **type-only** (a value
 * import would pull the AWS SDK into the browser bundle).
 */
import type { ToolSet } from 'ai';

import { createKnowledgeBaseTool } from './knowledge-base';
import { createPartyTools } from './party';
import { createPolicyTools } from './policy';
import { createVisualizationTools } from './visualization';

export type { ChartInput, ChartSpec, DiagramInput, DiagramSpec } from './visualization';

/** Authenticated scope, derived server-side from JWT claims — never from the model. */
export interface ToolScope {
  userId: string;
  email?: string;
  brokerId?: string;
  partyId?: string;
}

/**
 * Per-user scope headers added to every upstream call alongside the shared
 * bearer token, so the business APIs can authorize the acting user.
 */
export function buildScopeHeaders(scope?: ToolScope): Record<string, string> {
  if (!scope) return {};
  return {
    'X-Authenticated-User-Id': scope.userId,
    ...(scope.email ? { 'X-Authenticated-User-Email': scope.email } : {}),
    ...(scope.brokerId ? { 'X-Broker-Id': scope.brokerId } : {}),
    ...(scope.partyId ? { 'X-Party-Id': scope.partyId } : {}),
  };
}

export interface ToolsConfig {
  /** Party Service base URL; party/broker/relationship tools are omitted when unset. */
  partyBaseUrl?: string;
  /** Policy Service base URL; policy tools are omitted when unset. */
  policyBaseUrl?: string;
  /** Headers sent on every upstream call (bearer token + scope headers). */
  headers: Record<string, string>;
  /** Bedrock Knowledge Base; queryKnowledgeBase is omitted unless both are set. */
  knowledgeBaseId?: string;
  awsRegion?: string;
}

// Each factory result is widened to ToolSet *before* spreading. Spreading the
// conditionals directly makes tsc infer a union of every present/absent
// combination of 27 zod-typed tool generics, which exhausts its heap — the
// same blow-up that letting generateText/streamText infer the full union causes.
export function createTools(config: ToolsConfig): ToolSet {
  const party: ToolSet = config.partyBaseUrl
    ? createPartyTools(config.partyBaseUrl, config.headers)
    : {};
  const policy: ToolSet = config.policyBaseUrl
    ? createPolicyTools(config.policyBaseUrl, config.headers)
    : {};
  const knowledgeBase: ToolSet =
    config.knowledgeBaseId && config.awsRegion
      ? createKnowledgeBaseTool(config.knowledgeBaseId, config.awsRegion)
      : {};
  const visualization: ToolSet = createVisualizationTools();

  return { ...party, ...policy, ...knowledgeBase, ...visualization };
}

// The UIMessage type contract the frontend consumes lives in ./ui — a
// deliberately separate module that imports only the visualization factory,
// so the frontend's compile never loads the 24 API tool types.
