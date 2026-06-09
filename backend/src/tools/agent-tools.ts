import type { BusinessToolContext } from './business-api/business-tool-context';
import type { KnowledgeBaseService } from './knowledge-base/knowledge-base.service';
import { buildKnowledgeBaseTool } from './knowledge-base/knowledge-base.tool';
import type { PartyService } from './party/party.service';
import { buildPartyTools } from './party/party.tool';
import type { PolicyService } from './policy/policy.service';
import { buildPolicyTools } from './policy/policy.tool';

export interface AgentToolServices {
  policy: PolicyService;
  party: PartyService;
  knowledgeBase: KnowledgeBaseService;
}

/**
 * The model-facing tool registry: Policy Service + Party Service + knowledge
 * base, scoped to the authenticated user's context. Both the agent loop and
 * the tool harness CLI build their tools through here, so what the CLI tests
 * is exactly what the model can call. Do not add generic SQL/database tools.
 */
export function buildAgentTools(
  services: AgentToolServices,
  context: BusinessToolContext,
) {
  return {
    ...buildPolicyTools(services.policy, context),
    ...buildPartyTools(services.party, context),
    queryKnowledgeBase: buildKnowledgeBaseTool(services.knowledgeBase),
  };
}
