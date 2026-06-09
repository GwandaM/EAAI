import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
} from 'ai';
import type { Response } from 'express';

import { BEDROCK_MODEL } from '../llm/bedrock.provider';
import { HistoryService } from '../persistence/history.service';
import { buildAgentTools } from '../tools/agent-tools';
import { KnowledgeBaseService } from '../tools/knowledge-base/knowledge-base.service';
import { PolicyService } from '../tools/policy/policy.service';
import { PartyService } from '../tools/party/party.service';
import type { BusinessToolContext } from '../tools/business-api/business-tool-context';

import type { AuthenticatedUser } from '../auth/authenticated-user';
import type { ChatRequestDto } from './dto/chat-request.dto';

const SYSTEM_PROMPT = `You are the Invest Broker Agent.
Use the Policy Service tools for policy data, values, performance, withdrawals,
benefits, special offers, outstanding bills, policy search, and subscriptions.
Use the Party Service tools for parties, broker details, AUM, commissions,
broker clients, credit-control counts, and relationship validation. Use
queryKnowledgeBase for unstructured product, process, or document knowledge.
Never ask the user for internal database details and never invent policy,
client, or broker facts without tool support. Always cite the tool source in
your final answer. If a tool returns ok=false, explain the limitation and
continue with the best available answer rather than failing the conversation.`;

const MAX_AGENT_STEPS = 5;

interface StreamTextResult {
  pipeUIMessageStreamToResponse: (
    response: Response,
    options?: { onError?: (error: unknown) => string },
  ) => void;
}

interface StreamTextOptions {
  model: unknown;
  system: string;
  messages: unknown[];
  tools: Record<string, unknown>;
  stopWhen: unknown;
  maxRetries: number;
  onError?: (event: { error: unknown }) => void;
  onFinish?: (event: { text: string }) => void;
}

const streamTextLoose = streamText as unknown as (
  options: StreamTextOptions,
) => StreamTextResult;

const stepCountIsLoose = stepCountIs as unknown as (stepCount: number) => unknown;

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(BEDROCK_MODEL) private readonly model: unknown,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly policy: PolicyService,
    private readonly party: PartyService,
    private readonly history: HistoryService,
  ) {}

  async streamChat(
    request: ChatRequestDto,
    user: AuthenticatedUser,
    res: Response,
  ): Promise<void> {
    // Capture the user's parts BEFORE normalizeMessages: convertToModelMessages
    // mutates request.messages in place, which would otherwise leave us
    // persisting emptied-out parts.
    const conversationId = request.conversationId;
    const userPartsToPersist = conversationId ? this.userParts(request) : [];

    const messages = await this.normalizeMessages(request);
    this.logger.log(`Chat request from user ${user.userId}`);

    // Persist the user's turn before streaming. Best-effort: a history failure
    // must never block the chat response.
    if (conversationId) {
      void this.persist(user.userId, conversationId, 'user', userPartsToPersist);
    }

    const result = streamTextLoose({
      model: this.model,
      system: SYSTEM_PROMPT,
      messages,
      tools: buildAgentTools(
        {
          policy: this.policy,
          party: this.party,
          knowledgeBase: this.knowledgeBase,
        },
        this.toolContext(user),
      ),
      stopWhen: stepCountIsLoose(MAX_AGENT_STEPS),
      maxRetries: 2,
      onError: ({ error }) => {
        this.logger.error('streamText error', error as Error);
      },
      onFinish: ({ text }) => {
        if (conversationId && text) {
          void this.persist(user.userId, conversationId, 'assistant', [
            { type: 'text', text },
          ]);
        }
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

  /** The parts of the user's latest turn, for persistence (detached copy). */
  private userParts(request: ChatRequestDto): unknown[] {
    if (request.messages && request.messages.length > 0) {
      const last = request.messages[request.messages.length - 1];
      // Deep-clone so later in-place mutation of request.messages can't corrupt
      // what we persist.
      return last.parts ? structuredClone(last.parts) : [];
    }
    if (request.prompt) {
      return [{ type: 'text', text: request.prompt }];
    }
    return [];
  }

  /** Append a turn to history, swallowing errors so chat never fails on persistence. */
  private async persist(
    userId: string,
    conversationId: string,
    role: 'user' | 'assistant',
    parts: unknown[],
  ): Promise<void> {
    if (!this.history.enabled || parts.length === 0) {
      return;
    }
    try {
      const ok = await this.history.appendMessage(
        userId,
        conversationId,
        role,
        parts,
      );
      if (!ok) {
        this.logger.warn(
          `Skipped persisting ${role} turn: conversation ${conversationId} not found for user ${userId}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to persist ${role} turn: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async normalizeMessages(request: ChatRequestDto): Promise<unknown[]> {
    if (request.messages && request.messages.length > 0) {
      // convertToModelMessages is async in ai@6 (it was sync in v5). Awaiting it
      // is essential — otherwise streamText receives a Promise and fails with
      // "messages.some is not a function".
      const convertMessages = convertToModelMessages as unknown as (
        messages: unknown[],
      ) => Promise<unknown[]>;
      try {
        return await convertMessages(request.messages);
      } catch (error) {
        // The DTO only checks that `parts` is an array; convertToModelMessages does
        // the semantic validation. A structurally-valid-but-malformed payload is a
        // client error (400), not an internal failure (500).
        const detail =
          error instanceof Error ? error.message : 'unknown conversion error';
        throw new BadRequestException(`Invalid \`messages\` payload: ${detail}`);
      }
    }
    if (request.prompt) {
      return [{ role: 'user', content: request.prompt }];
    }
    throw new BadRequestException('Either `messages` or `prompt` is required.');
  }

  private toolContext(user: AuthenticatedUser): BusinessToolContext {
    return {
      userId: user.userId,
      email: user.email,
      brokerId: this.claimString(user, [
        'brokerId',
        'broker_id',
        'advisorId',
        'advisor_id',
        'custom:broker_id',
        'custom:advisor_id',
      ]),
      partyId: this.claimString(user, [
        'partyId',
        'party_id',
        'clientId',
        'client_id',
        'custom:party_id',
      ]),
    };
  }

  private claimString(user: AuthenticatedUser, names: string[]): string | undefined {
    for (const name of names) {
      const value = user.claims[name];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }
}
