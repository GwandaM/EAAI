import { tool } from 'ai';
import { z } from 'zod';

import { fetchJson } from './http';
import {
  BenefitSchema,
  MrDetailsSchema,
  MoneyCategorySchema,
  OutstandingBillSchema,
  PagedPolicySearchSchema,
  PolicyPerformanceValuesSchema,
  PolicySchema,
  PolicySearchResultSchema,
  PolicySubscriptionSchema,
  PolicyValuesSchema,
  SpecialOfferSchema,
  WithdrawalSchema,
} from './policy-schemas';

export function createPolicyTools(
  baseUrl: string,
  headers: Record<string, string>,
) {
  const get = (path: string) =>
    fetchJson(`${baseUrl}${path}`, { method: 'GET', headers });

  return {
    // ---- Policy ----

    getPolicy: tool({
      description: 'Get policy details by policy number.',
      inputSchema: z.object({
        policyNumber: z
          .string()
          .describe('The policy number to look up.'),
      }),
      execute: async ({ policyNumber }) => {
        const data = await get(`/policy/${policyNumber}`);
        return PolicySchema.parse(data);
      },
    }),

    // ---- Values & performance ----

    getPolicyPerformanceValues: tool({
      description:
        'Get the performance values (value over time) for a policy.',
      inputSchema: z.object({
        policyNumber: z.string().describe('The policy number.'),
      }),
      execute: async ({ policyNumber }) => {
        const data = await get(`/policy/${policyNumber}/performance-values`);
        return PolicyPerformanceValuesSchema.parse(data);
      },
    }),

    getPolicyValues: tool({
      description:
        'Get the current values of a policy (market value, surrender value).',
      inputSchema: z.object({
        policyNumber: z.string().describe('The policy number.'),
      }),
      execute: async ({ policyNumber }) => {
        const data = await get(`/policy/${policyNumber}/values`);
        return PolicyValuesSchema.parse(data);
      },
    }),

    getMrDetails: tool({
      description: 'Get the MR details for a policy.',
      inputSchema: z.object({
        policyNumber: z.string().describe('The policy number.'),
      }),
      execute: async ({ policyNumber }) => {
        const data = await get(`/policy/${policyNumber}/mr-details`);
        return MrDetailsSchema.parse(data);
      },
    }),

    getMoneyCategories: tool({
      description:
        'Get the money categories (value breakdown by category) for a policy.',
      inputSchema: z.object({
        policyNumber: z.string().describe('The policy number.'),
      }),
      execute: async ({ policyNumber }) => {
        const data = await get(`/policy/${policyNumber}/money-categories`);
        return z.array(MoneyCategorySchema).parse(data);
      },
    }),

    // ---- Transactions & benefits ----

    getWithdrawals: tool({
      description:
        'Get the withdrawals on a policy, optionally bounded by date range.',
      inputSchema: z.object({
        policyNumber: z.string().describe('The policy number.'),
        fromDate: z
          .string()
          .optional()
          .describe('Optional inclusive start date (ISO format).'),
        toDate: z
          .string()
          .optional()
          .describe('Optional inclusive end date (ISO format).'),
      }),
      execute: async ({ policyNumber, fromDate, toDate }) => {
        const params = new URLSearchParams();
        if (fromDate) params.set('fromDate', fromDate);
        if (toDate) params.set('toDate', toDate);
        const query = params.size > 0 ? `?${params}` : '';

        const data = await get(`/policy/${policyNumber}/withdrawals${query}`);
        return z.array(WithdrawalSchema).parse(data);
      },
    }),

    getBenefits: tool({
      description: 'Get the benefits attached to a policy.',
      inputSchema: z.object({
        policyNumber: z.string().describe('The policy number.'),
      }),
      execute: async ({ policyNumber }) => {
        const data = await get(`/policy/${policyNumber}/benefits`);
        return z.array(BenefitSchema).parse(data);
      },
    }),

    getSpecialOffers: tool({
      description:
        'Get special offers, optionally filtered by policy or entity.',
      inputSchema: z.object({
        policyNumber: z
          .string()
          .optional()
          .describe('Optional filter by policy number.'),
        entityNumber: z
          .string()
          .optional()
          .describe('Optional filter by entity number.'),
      }),
      execute: async ({ policyNumber, entityNumber }) => {
        const params = new URLSearchParams();
        if (policyNumber) params.set('policyNumber', policyNumber);
        if (entityNumber) params.set('entityNumber', entityNumber);
        const query = params.size > 0 ? `?${params}` : '';

        const data = await get(`/policy/special-offers${query}`);
        return z.array(SpecialOfferSchema).parse(data);
      },
    }),

    getOutstandingBills: tool({
      description:
        'Get outstanding bills, optionally filtered by policy or entity.',
      inputSchema: z.object({
        policyNumber: z
          .string()
          .optional()
          .describe('Optional filter by policy number.'),
        entityNumber: z
          .string()
          .optional()
          .describe('Optional filter by entity number.'),
      }),
      execute: async ({ policyNumber, entityNumber }) => {
        const params = new URLSearchParams();
        if (policyNumber) params.set('policyNumber', policyNumber);
        if (entityNumber) params.set('entityNumber', entityNumber);
        const query = params.size > 0 ? `?${params}` : '';

        const data = await get(`/policy/outstanding-bills${query}`);
        return z.array(OutstandingBillSchema).parse(data);
      },
    }),

    // ---- Search ----

    searchPolicies: tool({
      description: 'Search policies by phrase, entity, or status.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Policy number, product, owner name, or search phrase.'),
        entityNumber: z
          .string()
          .optional()
          .describe('Optional filter by owner entity number.'),
        status: z
          .string()
          .optional()
          .describe('Optional filter by policy status.'),
      }),
      execute: async ({ query, entityNumber, status }) => {
        const params = new URLSearchParams({ query });
        if (entityNumber) params.set('entityNumber', entityNumber);
        if (status) params.set('status', status);

        const data = await get(`/policy/search?${params}`);
        return z.array(PolicySearchResultSchema).parse(data);
      },
    }),

    pagedSearchPolicies: tool({
      description:
        'Search policies with pagination. Prefer this over searchPolicies for broad queries.',
      inputSchema: z.object({
        query: z
          .string()
          .optional()
          .describe('Policy number, product, owner name, or search phrase.'),
        entityNumber: z
          .string()
          .optional()
          .describe('Optional filter by owner entity number.'),
        status: z
          .string()
          .optional()
          .describe('Optional filter by policy status.'),
        page: z.number().default(1).describe('One-based result page.'),
        pageSize: z.number().default(25).describe('Results per page.'),
      }),
      execute: async ({ query, entityNumber, status, page, pageSize }) => {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });
        if (query) params.set('query', query);
        if (entityNumber) params.set('entityNumber', entityNumber);
        if (status) params.set('status', status);

        const data = await get(`/policy/paged-search?${params}`);
        return PagedPolicySearchSchema.parse(data);
      },
    }),

    // ---- Subscriptions ----

    getPolicySubscriptions: tool({
      description:
        'Get the subscriptions (parties and their roles) on a policy.',
      inputSchema: z.object({
        policyNumber: z.string().describe('The policy number.'),
      }),
      execute: async ({ policyNumber }) => {
        const data = await get(`/policy/${policyNumber}/subscriptions`);
        return z.array(PolicySubscriptionSchema).parse(data);
      },
    }),
  };
}
