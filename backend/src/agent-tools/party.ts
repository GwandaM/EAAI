import { tool } from 'ai';
import { z } from 'zod';

import { fetchJson } from './http';
import {
  AumSummarySchema,
  BrokerDetailsSchema,
  ClientSearchSchema,
  CommissionSummarySchema,
  PartyV2Schema,
  RelatedPartySchema,
  RelationshipPathValidationItemSchema,
  RelationshipPathValidationResponseSchema,
  RelationshipSchema,
  SubscriptionSchema,
} from './party-schemas';

export function createPartyTools(
  baseUrl: string,
  headers: Record<string, string>,
) {
  const get = (path: string) =>
    fetchJson(`${baseUrl}${path}`, { method: 'GET', headers });

  const post = (path: string, body: unknown) =>
    fetchJson(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  return {
    // ---- Party ----

    getParty: tool({
      description: 'Get party details by entity number (v2 format).',
      inputSchema: z.object({
        entityNumber: z
          .string()
          .describe('The entity number of the party to look up.'),
      }),
      execute: async ({ entityNumber }) => {
        const data = await get(`/party/v2/s/${entityNumber}`);
        return PartyV2Schema.parse(data);
      },
    }),

    getRelatedParties: tool({
      description:
        'Get parties related to a given entity, traversing the relationship tree.',
      inputSchema: z.object({
        entityNumber: z
          .string()
          .describe('The root entity number to start from.'),
        maxDepth: z
          .number()
          .default(1)
          .describe('How many levels deep to traverse.'),
        index: z.number().default(0).describe('Pagination offset.'),
        limit: z.number().default(50).describe('Maximum results to return.'),
        relationshipFilter: z
          .array(z.string())
          .optional()
          .describe(
            'Optional list of exact relationshipPath values to filter by.',
          ),
        includeTotal: z
          .boolean()
          .default(false)
          .describe('Whether to include total count headers.'),
      }),
      execute: async ({
        entityNumber,
        maxDepth,
        index,
        limit,
        relationshipFilter,
        includeTotal,
      }) => {
        const params = new URLSearchParams({
          maxDepth: String(maxDepth),
          index: String(index),
          limit: String(limit),
        });

        if (relationshipFilter?.length) {
          params.set('relationshipFilter', relationshipFilter.join(','));
        }

        const url = `/party/v2/s/${entityNumber}/related-parties?${params}`;
        const resp = await fetch(`${baseUrl}${url}`, { headers });

        if (!resp.ok) {
          throw new Error(`${resp.status} from ${url}`);
        }

        const items = z.array(RelatedPartySchema).parse(await resp.json());

        let totalCount: number | null = null;
        let countToMaxDepth: number | null = null;

        if (includeTotal) {
          const rawTotal = resp.headers.get('X-Total-Count');
          const rawDepth = resp.headers.get('X-Count-To-Max-Depth');
          if (rawTotal !== null) totalCount = Number(rawTotal);
          if (rawDepth !== null) countToMaxDepth = Number(rawDepth);
        }

        return { items, totalCount, countToMaxDepth };
      },
    }),

    // ---- Subscriptions ----

    getSubscriptions: tool({
      description: 'Get policy subscriptions for a given entity.',
      inputSchema: z.object({
        entityNumber: z
          .string()
          .describe('The entity number to look up subscriptions for.'),
        skip: z
          .number()
          .default(0)
          .describe('Number of items to skip for pagination.'),
        take: z
          .number()
          .default(50)
          .describe('Maximum items to return, capped at 50.'),
        policyNumber: z
          .string()
          .optional()
          .describe('Optional filter by policy number.'),
        role: z
          .string()
          .optional()
          .describe('Optional filter by role (e.g. owner, beneficiary).'),
      }),
      execute: async ({ entityNumber, skip, take, policyNumber, role }) => {
        const params = new URLSearchParams({
          skip: String(skip),
          take: String(take),
        });
        if (policyNumber) params.set('policyNumber', policyNumber);
        if (role) params.set('role', role);

        const data = await get(
          `/party/subscriptions/${entityNumber}?${params}`,
        );
        return z.array(SubscriptionSchema).parse(data);
      },
    }),

    // ---- Broker ----

    getBrokerDetails: tool({
      description: 'Get broker profile details by entity number.',
      inputSchema: z.object({
        entityNumber: z.string().describe('The entity number'),
      }),
      execute: async ({ entityNumber }) => {
        const data = await get(`/brokerDetails/${entityNumber}`);
        return BrokerDetailsSchema.parse(data);
      },
    }),

    getAumSummary: tool({
      description:
        'Get the assets-under-management summary for a broker by entity number.',
      inputSchema: z.object({
        entityNumber: z.string().describe('The broker entity number.'),
      }),
      execute: async ({ entityNumber }) => {
        const data = await get(`/brokerDetails/${entityNumber}/aum-summary`);
        return AumSummarySchema.parse(data);
      },
    }),

    getCommissionSummary: tool({
      description:
        'Get the commission summary for a broker, optionally bounded by date range.',
      inputSchema: z.object({
        entityNumber: z.string().describe('The broker entity number.'),
        fromDate: z
          .string()
          .optional()
          .describe('Optional inclusive start date (ISO format).'),
        toDate: z
          .string()
          .optional()
          .describe('Optional inclusive end date (ISO format).'),
      }),
      execute: async ({ entityNumber, fromDate, toDate }) => {
        const params = new URLSearchParams();
        if (fromDate) params.set('fromDate', fromDate);
        if (toDate) params.set('toDate', toDate);
        const query = params.size > 0 ? `?${params}` : '';

        const data = await get(
          `/brokerDetails/${entityNumber}/commission-summary${query}`,
        );
        return CommissionSummarySchema.parse(data);
      },
    }),

    searchBrokerClients: tool({
      description: "Search a broker's clients by name, id, or phrase.",
      inputSchema: z.object({
        entityNumber: z.string().describe('The broker entity number.'),
        query: z
          .string()
          .describe('Client name, id, email, or search phrase.'),
        page: z.number().default(1).describe('One-based result page.'),
        pageSize: z.number().default(25).describe('Results per page.'),
      }),
      execute: async ({ entityNumber, query, page, pageSize }) => {
        const params = new URLSearchParams({
          query,
          page: String(page),
          pageSize: String(pageSize),
        });

        const data = await get(
          `/brokerDetails/${entityNumber}/clients/search?${params}`,
        );
        return ClientSearchSchema.parse(data);
      },
    }),

    getGriffinCandidateFor: tool({
      description:
        'Get Griffin candidate information for a broker by entity number.',
      inputSchema: z.object({
        entityNumber: z.string().describe('The broker entity number.'),
      }),
      execute: async ({ entityNumber }) => {
        const data = await get(
          `/brokerDetails/${entityNumber}/griffin-candidate-for`,
        );
        return data;
      },
    }),

    // ---- Relationships ----

    getPartyRelationships: tool({
      description: 'Get the relationships attached to a party.',
      inputSchema: z.object({
        entityNumber: z.string().describe('The party entity number.'),
      }),
      execute: async ({ entityNumber }) => {
        const data = await get(`/relationships/party/${entityNumber}`);
        return z.array(RelationshipSchema).parse(data);
      },
    }),

    getOrganisationRelationships: tool({
      description: 'Get the relationships attached to an organisation.',
      inputSchema: z.object({
        entityNumber: z
          .string()
          .describe('The organisation entity number.'),
      }),
      execute: async ({ entityNumber }) => {
        const data = await get(`/relationships/organisation/${entityNumber}`);
        return z.array(RelationshipSchema).parse(data);
      },
    }),

    validateRelationshipPath: tool({
      description:
        'Validate that a single relationship path between two entities exists and is allowed.',
      inputSchema: z.object({
        fromEntityNumber: z
          .string()
          .describe('The source entity number.'),
        toEntityNumber: z.string().describe('The target entity number.'),
        relationshipPath: z
          .string()
          .optional()
          .describe('Optional exact relationshipPath value to validate.'),
      }),
      execute: async (input) => {
        const data = await post('/relationships/validate-path', input);
        return RelationshipPathValidationItemSchema.parse(data);
      },
    }),

    validateRelationshipPaths: tool({
      description:
        'Validate multiple relationship paths between entities in one call.',
      inputSchema: z.object({
        paths: z
          .array(
            z.object({
              fromEntityNumber: z
                .string()
                .describe('The source entity number.'),
              toEntityNumber: z
                .string()
                .describe('The target entity number.'),
              relationshipPath: z
                .string()
                .optional()
                .describe('Optional exact relationshipPath value.'),
            }),
          )
          .min(1)
          .describe('Relationship paths to validate.'),
      }),
      execute: async (input) => {
        const data = await post('/relationships/validate-paths', input);
        return RelationshipPathValidationResponseSchema.parse(data);
      },
    }),
  };
}
