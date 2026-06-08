import { z } from 'zod';

import type { DatabaseService, SalesQueryOutput } from './database.service';
import { defineAgentTool } from '../ai-tool';
import { wrapToolResult, type ToolOutcome } from '../tool-result';

const inputSchema = z.object({
  metric: z
    .enum(['sales', 'revenue', 'margin', 'units_sold'])
    .describe('The business metric to retrieve.'),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD')
    .describe('Inclusive start date in YYYY-MM-DD format.'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD')
    .describe('Inclusive end date in YYYY-MM-DD format.'),
  productId: z.string().min(1).optional().describe('Optional product ID filter.'),
  region: z.string().min(1).optional().describe('Optional region filter (e.g. EMEA, NA, APAC).'),
});

type Input = z.infer<typeof inputSchema>;
type Output = ToolOutcome<SalesQueryOutput>;

export function buildDatabaseTool(service: DatabaseService) {
  return defineAgentTool<Input, Output>({
    description:
      'Fetch structured sales or performance records from PostgreSQL using a constrained, parameterized query. Use when the user asks about sales, revenue, margin, or units sold over a date range.',
    inputSchema,
    execute: async (input) => {
      return wrapToolResult('database.querySales', () => service.querySales(input));
    },
  });
}
