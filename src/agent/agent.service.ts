import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type UIMessage,
} from 'ai';
import type { Response } from 'express';

import { BEDROCK_MODEL } from '../llm/bedrock.provider';
import { CompanyApiService } from '../tools/company-api/company-api.service';
import { buildCompanyApiTool } from '../tools/company-api/company-api.tool';
import { DatabaseService } from '../tools/database/database.service';
import { buildDatabaseTool } from '../tools/database/database.tool';
import { KnowledgeBaseService } from '../tools/knowledge-base/knowledge-base.service';
import { buildKnowledgeBaseTool } from '../tools/knowledge-base/knowledge-base.tool';

import type { ChatRequestDto } from './dto/chat-request.dto';

const DEFAULT_SYSTEM_PROMPT = `You are an enterprise AI agent assisting employees.
Use tools whenever current company facts, internal documents, pricing, sales,
or performance data are needed. Always cite the tool source in your final answer.
If a tool returns ok=false, explain the limitation and continue with the best
available answer rather than failing the conversation.`;

const MAX_AGENT_STEPS = 5;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(BEDROCK_MODEL) private readonly model: LanguageModel,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly companyApi: CompanyApiService,
    private readonly database: DatabaseService,
  ) {}

  streamChat(request: ChatRequestDto, res: Response): void {
    const messages = this.normalizeMessages(request);

    const result = streamText({
      model: this.model,
      system: request.system ?? DEFAULT_SYSTEM_PROMPT,
      messages,
      tools: {
        searchKnowledgeBase: buildKnowledgeBaseTool(this.knowledgeBase),
        getCompanyProduct: buildCompanyApiTool(this.companyApi),
        querySalesPerformance: buildDatabaseTool(this.database),
      },
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      maxRetries: 2,
      onError: ({ error }) => {
        this.logger.error('streamText error', error as Error);
      },
    });

    // Pipe the AI SDK's UI Message Stream directly to the Express response.
    // This sets the right SSE-style headers, handles backpressure, and emits the
    // wire format that Vercel AI SDK's useChat() consumes on the frontend.
    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        this.logger.error('UI stream serialization error', error as Error);
        return 'An internal error occurred while generating the response.';
      },
    });
  }

  private normalizeMessages(request: ChatRequestDto): ModelMessage[] {
    if (request.messages && request.messages.length > 0) {
      return convertToModelMessages(request.messages as unknown as UIMessage[]);
    }
    if (request.prompt) {
      return [{ role: 'user', content: request.prompt }];
    }
    throw new Error('Either `messages` or `prompt` is required.');
  }
}
