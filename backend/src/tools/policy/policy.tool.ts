import { z } from 'zod';

import { defineAgentTool } from '../ai-tool';
import type { BusinessToolContext } from '../business-api/business-tool-context';
import { wrapToolResult, type ToolOutcome } from '../tool-result';
import type { PolicyService } from './policy.service';

/**
 * Policy ids are numeric in the business API. Accept a number (or numeric
 * string) from the model, reject anything non-numeric, and normalize to a
 * string because ids travel in URL path/query segments.
 */
const policyIdField = z.coerce
  .number()
  .int()
  .positive()
  .describe('The numeric policy identifier.')
  .transform((id) => String(id));

const policyIdSchema = z.object({
  policyId: policyIdField,
});

const policyWithdrawalsSchema = policyIdSchema.extend({
  fromDate: z.string().min(1).optional().describe('Optional inclusive start date.'),
  toDate: z.string().min(1).optional().describe('Optional inclusive end date.'),
});

const policyPartySchema = z
  .object({
    policyId: policyIdField.optional(),
    partyId: z.string().min(1).optional().describe('The party/client identifier.'),
  })
  .refine((input) => input.policyId || input.partyId, {
    message: 'Either policyId or partyId is required.',
  });

const searchPoliciesSchema = z.object({
  query: z.string().min(1).describe('Policy number, client name, or search phrase.'),
  partyId: z.string().min(1).optional().describe('Optional party/client identifier.'),
  status: z.string().min(1).optional().describe('Optional policy status filter.'),
});

const pagedSearchPoliciesSchema = z.object({
  query: z.string().min(1).optional().describe('Optional policy search phrase.'),
  partyId: z.string().min(1).optional().describe('Optional party/client identifier.'),
  status: z.string().min(1).optional().describe('Optional policy status filter.'),
  page: z.number().int().min(1).default(1).describe('One-based result page.'),
  pageSize: z.number().int().min(1).max(100).default(25).describe('Results per page.'),
});

type ToolOutput = ToolOutcome<unknown>;

function businessTool<Input>(
  description: string,
  // Third type param is `unknown` so schemas may transform (e.g. coerce a
  // numeric policyId to string): the model-facing input type can differ from
  // the parsed type the service receives.
  inputSchema: z.ZodType<Input, z.ZodTypeDef, unknown>,
  execute: (input: Input) => Promise<unknown>,
) {
  return defineAgentTool<Input, ToolOutput>({
    description,
    inputSchema,
    execute: async (input) => wrapToolResult('policyService', () => execute(input)),
  });
}

export function buildPolicyTools(
  service: PolicyService,
  context: BusinessToolContext,
) {
  return {
    getPolicy: businessTool(
      'Get policy header and detail information from the Policy Service by policy id.',
      policyIdSchema,
      (input) => service.getPolicy(context, input),
    ),
    getPolicyPerformanceValues: businessTool(
      'Get investment performance values for a policy from the Policy Service.',
      policyIdSchema,
      (input) => service.getPolicyPerformanceValues(context, input),
    ),
    getPolicyValues: businessTool(
      'Get current policy values, balances, or valuation details from the Policy Service.',
      policyIdSchema,
      (input) => service.getPolicyValues(context, input),
    ),
    getIrrDetails: businessTool(
      'Get internal rate of return details for a policy from the Policy Service.',
      policyIdSchema,
      (input) => service.getIrrDetails(context, input),
    ),
    getMoneyCategories: businessTool(
      'Get money categories or investment buckets for a policy from the Policy Service.',
      policyIdSchema,
      (input) => service.getMoneyCategories(context, input),
    ),
    getWithdrawals: businessTool(
      'Get policy withdrawals from the Policy Service, optionally filtered by date range.',
      policyWithdrawalsSchema,
      (input) => service.getWithdrawals(context, input),
    ),
    getBenefits: businessTool(
      'Get policy benefits from the Policy Service.',
      policyIdSchema,
      (input) => service.getBenefits(context, input),
    ),
    getSpecialOffers: businessTool(
      'Get policy or client special offers from the Policy Service.',
      policyPartySchema,
      (input) => service.getSpecialOffers(context, input),
    ),
    getOutstandingBills: businessTool(
      'Get outstanding bills for a policy or client from the Policy Service.',
      policyPartySchema,
      (input) => service.getOutstandingBills(context, input),
    ),
    searchPolicies: businessTool(
      'Search policies by policy number, client, or phrase using the Policy Service.',
      searchPoliciesSchema,
      (input) => service.searchPolicies(context, input),
    ),
    pagedSearchPolicies: businessTool(
      'Paged policy search through the Policy Service for larger result sets.',
      pagedSearchPoliciesSchema,
      (input) => service.pagedSearchPolicies(context, input),
    ),
    getPolicySubscriptions: businessTool(
      'Get policy subscriptions or recurring contributions from the Policy Service.',
      policyIdSchema,
      (input) => service.getPolicySubscriptions(context, input),
    ),
  };
}
