import { z } from 'zod';

import { defineAgentTool } from '../ai-tool';
import type { BusinessToolContext } from '../business-api/business-tool-context';
import { wrapToolResult, type ToolOutcome } from '../tool-result';
import type { PartyService } from './party.service';

const partyIdSchema = z.object({
  partyId: z.string().min(1).describe('The party/client identifier.'),
});

const relatedPartiesSchema = partyIdSchema.extend({
  relationshipType: z.string().min(1).optional().describe('Optional relationship type filter.'),
});

const brokerScopedSchema = z.object({
  brokerId: z
    .string()
    .min(1)
    .optional()
    .describe('Optional broker identifier. Defaults to the authenticated broker context.'),
});

const aumSummarySchema = brokerScopedSchema.extend({
  partyId: z.string().min(1).optional().describe('Optional party/client identifier.'),
});

const commissionSummarySchema = brokerScopedSchema.extend({
  fromDate: z.string().min(1).optional().describe('Optional inclusive start date.'),
  toDate: z.string().min(1).optional().describe('Optional inclusive end date.'),
});

const searchBrokerClientsSchema = brokerScopedSchema.extend({
  query: z.string().min(1).describe('Client name, id, email, or search phrase.'),
  page: z.number().int().min(1).default(1).describe('One-based result page.'),
  pageSize: z.number().int().min(1).max(100).default(25).describe('Results per page.'),
});

const policyRelationshipsSchema = z.object({
  policyId: z.string().min(1).describe('The policy identifier.'),
});

const organisationRelationshipsSchema = z.object({
  organisationId: z.string().min(1).describe('The organisation identifier.'),
});

const relationshipPathSchema = z.object({
  fromPartyId: z.string().min(1).describe('The source party identifier.'),
  toPartyId: z.string().min(1).describe('The target party identifier.'),
  relationshipTypes: z
    .array(z.string().min(1))
    .optional()
    .describe('Optional allowed relationship types for the path.'),
});

const relationshipPathsSchema = z.object({
  paths: z
    .array(relationshipPathSchema)
    .min(1)
    .max(25)
    .describe('Relationship paths to validate.'),
});

type ToolOutput = ToolOutcome<unknown>;

function businessTool<Input>(
  description: string,
  inputSchema: z.ZodType<Input>,
  execute: (input: Input) => Promise<unknown>,
) {
  return defineAgentTool<Input, ToolOutput>({
    description,
    inputSchema,
    execute: async (input) => wrapToolResult('partyService', () => execute(input)),
  });
}

export function buildPartyTools(
  service: PartyService,
  context: BusinessToolContext,
) {
  return {
    getParty: businessTool(
      'Get party/client profile information from the Party Service.',
      partyIdSchema,
      (input) => service.getParty(context, input),
    ),
    getRelatedParties: businessTool(
      'Get parties related to a client, person, broker, or organisation from the Party Service.',
      relatedPartiesSchema,
      (input) => service.getRelatedParties(context, input),
    ),
    getSubscriptions: businessTool(
      'Get subscriptions for a party/client from the Party Service.',
      partyIdSchema,
      (input) => service.getSubscriptions(context, input),
    ),
    getBrokerDetails: businessTool(
      'Get broker details for the authenticated broker or a specified broker id.',
      brokerScopedSchema,
      (input) => service.getBrokerDetails(context, input),
    ),
    getAumSummary: businessTool(
      'Get assets under management summary from the Party Service.',
      aumSummarySchema,
      (input) => service.getAumSummary(context, input),
    ),
    getCommissionSummary: businessTool(
      'Get broker commission summary from the Party Service.',
      commissionSummarySchema,
      (input) => service.getCommissionSummary(context, input),
    ),
    searchBrokerClients: businessTool(
      'Search clients associated with the authenticated broker through the Party Service.',
      searchBrokerClientsSchema,
      (input) => service.searchBrokerClients(context, input),
    ),
    getCreditControlClientCount: businessTool(
      'Get the broker credit-control client count from the Party Service.',
      brokerScopedSchema,
      (input) => service.getCreditControlClientCount(context, input),
    ),
    getPolicyRelationships: businessTool(
      'Get policy-party relationship records from the Party Service.',
      policyRelationshipsSchema,
      (input) => service.getPolicyRelationships(context, input),
    ),
    getOrganisationRelationships: businessTool(
      'Get organisation relationship records from the Party Service.',
      organisationRelationshipsSchema,
      (input) => service.getOrganisationRelationships(context, input),
    ),
    validateRelationshipPath: businessTool(
      'Validate that a relationship path exists and is allowed for the authenticated broker context.',
      relationshipPathSchema,
      (input) => service.validateRelationshipPath(context, input),
    ),
    validateRelationshipPaths: businessTool(
      'Validate multiple relationship paths for the authenticated broker context.',
      relationshipPathsSchema,
      (input) => service.validateRelationshipPaths(context, input),
    ),
  };
}
