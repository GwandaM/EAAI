import { z } from 'zod';

import type {
  KnowledgeBaseRetrieveOutput,
  KnowledgeBaseService,
} from './knowledge-base.service';
import { defineAgentTool } from '../ai-tool';
import { wrapToolResult, type ToolOutcome } from '../tool-result';

const inputSchema = z.object({
  searchPhrase: z
    .string()
    .min(2)
    .describe('The user search phrase to retrieve relevant enterprise documents.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe('Maximum number of paragraphs to retrieve.'),
});

type Input = z.infer<typeof inputSchema>;
type Output = ToolOutcome<KnowledgeBaseRetrieveOutput>;

export function buildKnowledgeBaseTool(service: KnowledgeBaseService) {
  return defineAgentTool<Input, Output>({
    description:
      'Search internal Bedrock Knowledge Base documents and return matching document paragraphs with source metadata. Use when the user asks about internal company knowledge, policies, or documentation.',
    inputSchema,
    execute: async (input) => {
      return wrapToolResult('knowledgeBase.search', () => service.retrieve(input));
    },
  });
}
