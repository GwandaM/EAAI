import { z } from 'zod';

import type { CompanyApiService, CompanyProduct } from './company-api.service';
import { defineAgentTool } from '../ai-tool';
import { wrapToolResult, type ToolOutcome } from '../tool-result';

const inputSchema = z.object({
  productId: z
    .string()
    .min(1)
    .describe('The company product identifier, SKU, or catalog ID.'),
});

type Input = z.infer<typeof inputSchema>;
type Output = ToolOutcome<CompanyProduct>;

export function buildCompanyApiTool(service: CompanyApiService) {
  return defineAgentTool<Input, Output>({
    description:
      'Fetch live product, availability, or pricing information from the company REST API by product ID. Use when the user asks about a specific product, SKU, or pricing.',
    inputSchema,
    execute: async ({ productId }) => {
      return wrapToolResult('companyApi.getProduct', () => service.getProduct(productId));
    },
  });
}
