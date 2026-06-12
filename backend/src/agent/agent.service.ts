import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  convertToModelMessages,
  generateText,
  stepCountIs,
  streamText,
  type ModelMessage,
} from "ai";
import type { Response } from "express";

import type { ToolScope } from "../agent-tools";
import type { AuthenticatedUser } from "../auth/authenticated-user";
import type { AppConfig } from "../config/configuration";
import { HistoryService } from "../persistence/history.service";
import { ToolsService } from "../tools/tools.service";
import { MAX_AGENT_STEPS, SYSTEM_PROMPT, createModel } from "./agent.constants";
import type { ChatRequestDto } from "./dto/chat-request.dto";
import { onStepFinish, onToolCallFinish, onToolCallStart } from "./tool-trace";

const TITLE_SYSTEM_PROMPT = `You write titles for conversations between an
investment broker and an AI assistant. Summarize the conversation's topic in
one short phrase of at most six words, in the language of the conversation.
Respond with the title only — no quotes, no trailing punctuation, no
explanations.`;

// How much of each turn the title model sees; titles only need the gist.
const TITLE_CONTEXT_CHARS = 1500;
const TITLE_MAX_LENGTH = 80;

interface UIMessageStreamFinishEvent {
  responseMessage?: { parts?: unknown[] };
  isAborted?: boolean;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly awsRegion: string;
  private readonly modelId: string;
  private readonly isProduction: boolean;

  constructor(
    @Inject(ToolsService) private readonly toolsService: ToolsService,
    @Inject(HistoryService) private readonly history: HistoryService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
  ) {
    this.awsRegion = config.get("aws", { infer: true }).region;
    this.modelId = config.get("bedrock", { infer: true }).modelId;
    this.isProduction = config.get("nodeEnv", { infer: true }) === "production";
  }

  /**
   * Streaming chat for the frontend: emits the AI SDK UI Message Stream that
   * useChat() consumes, with tools scoped to the authenticated user, and
   * persists both turns of the conversation when a conversationId is given.
   */
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
      void this.persist(user.userId, conversationId, "user", userPartsToPersist);
    }

    const result = streamText({
      model: createModel(this.awsRegion, this.modelId),
      system: SYSTEM_PROMPT,
      messages,
      tools: this.toolsService.createTools(this.toolScope(user)),
      stopWhen: stepCountIs(MAX_AGENT_STEPS),
      maxRetries: 2,
      experimental_onToolCallStart: onToolCallStart,
      experimental_onToolCallFinish: onToolCallFinish,
      onStepFinish,
      onError: ({ error }) => {
        this.logger.error(
          `streamText error: ${this.describeError(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      },
    });

    // Pipe the AI SDK's UI Message Stream directly to the Express response.
    // This sets the right SSE-style headers, handles backpressure, and emits the
    // wire format that Vercel AI SDK's useChat() consumes on the frontend.
    result.pipeUIMessageStreamToResponse(res, {
      // The UI-message onFinish (unlike streamText's) carries the assistant
      // message with its tool parts, so charts/diagrams survive a reload.
      onFinish: ({ responseMessage, isAborted }: UIMessageStreamFinishEvent) => {
        if (!conversationId || isAborted) {
          return;
        }
        const parts = this.persistableParts(responseMessage?.parts ?? []);
        if (parts.length > 0) {
          void this.persist(user.userId, conversationId, "assistant", parts);
        }
        // Best-effort: summarize the first exchange into a sidebar title.
        void this.maybeGenerateTitle(
          user.userId,
          conversationId,
          userPartsToPersist,
          parts,
        );
      },
      onError: (error: unknown) => {
        const detail = this.describeError(error);
        this.logger.error(
          `Agent stream failed: ${detail}`,
          error instanceof Error ? error.stack : undefined,
        );
        // Outside production, send the real cause to the client so failures
        // (bad credentials, wrong model id, unreachable upstream, …) are
        // debuggable from the browser. In production, keep details server-side.
        return this.isProduction
          ? "An internal error occurred while generating the response."
          : `Agent error: ${detail}`;
      },
    });
  }

  private toolScope(user: AuthenticatedUser): ToolScope {
    return {
      userId: user.userId,
      email: user.email,
      brokerId: this.claimString(user, [
        "brokerId",
        "broker_id",
        "advisorId",
        "advisor_id",
        "custom:broker_id",
        "custom:advisor_id",
      ]),
      partyId: this.claimString(user, [
        "partyId",
        "party_id",
        "clientId",
        "client_id",
        "custom:party_id",
      ]),
    };
  }

  private claimString(user: AuthenticatedUser, names: string[]): string | undefined {
    for (const name of names) {
      const value = user.claims[name];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }

  private describeError(error: unknown): string {
    if (error instanceof Error) {
      const cause =
        error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
      return `${error.name}: ${error.message}${cause}`;
    }
    return typeof error === "string" ? error : JSON.stringify(error);
  }

  /**
   * Assistant parts worth replaying on reload: the text answer plus completed
   * visualizations. Intermediate tool parts (policy/party lookups, failed or
   * still-streaming visualizations) would only render as stale placeholders in
   * the frontend, so they are dropped.
   */
  private persistableParts(parts: unknown[]): unknown[] {
    return parts.filter((part) => {
      const p = part as {
        type?: string;
        text?: string;
        state?: string;
        output?: { ok?: boolean };
      };
      if (p.type === "text") {
        return typeof p.text === "string" && p.text.length > 0;
      }
      if (p.type === "tool-presentChart" || p.type === "tool-presentDiagram") {
        return p.state === "output-available" && p.output?.ok === true;
      }
      return false;
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
      return [{ type: "text", text: request.prompt }];
    }
    return [];
  }

  /**
   * Generate an LLM summary title for a still-untitled conversation, based on
   * the first user/assistant exchange. Fire-and-forget: any failure is logged
   * and the conversation simply stays untitled until the next turn retries.
   */
  private async maybeGenerateTitle(
    userId: string,
    conversationId: string,
    userParts: unknown[],
    assistantParts: unknown[],
  ): Promise<void> {
    try {
      if (!this.history.enabled) {
        return;
      }
      if (!(await this.history.conversationNeedsTitle(userId, conversationId))) {
        return;
      }
      const userText = this.textFromParts(userParts);
      if (!userText) {
        return;
      }
      const assistantText = this.textFromParts(assistantParts);
      const { text } = await generateText({
        model: createModel(this.awsRegion, this.modelId),
        system: TITLE_SYSTEM_PROMPT,
        prompt: `User: ${userText.slice(0, TITLE_CONTEXT_CHARS)}\n\nAssistant: ${assistantText.slice(0, TITLE_CONTEXT_CHARS)}`,
        maxRetries: 1,
      });
      const title = this.sanitizeTitle(text);
      if (title) {
        await this.history.setTitleIfUnset(userId, conversationId, title);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to generate conversation title: ${this.describeError(error)}`,
      );
    }
  }

  /** Concatenated text content of a message's parts (tool parts are skipped). */
  private textFromParts(parts: unknown[]): string {
    return parts
      .map((part) => {
        const p = part as { type?: string; text?: string };
        return p.type === "text" && typeof p.text === "string" ? p.text : "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  /** Normalize model output into a single-line title, or null if unusable. */
  private sanitizeTitle(raw: string): string | null {
    const title = raw
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^["'`]+|["'`.]+$/g, "")
      .trim();
    if (!title) {
      return null;
    }
    return title.length > TITLE_MAX_LENGTH
      ? `${title.slice(0, TITLE_MAX_LENGTH - 1)}…`
      : title;
  }

  /** Append a turn to history, swallowing errors so chat never fails on persistence. */
  private async persist(
    userId: string,
    conversationId: string,
    role: "user" | "assistant",
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

  private async normalizeMessages(request: ChatRequestDto): Promise<ModelMessage[]> {
    if (request.messages && request.messages.length > 0) {
      try {
        return await convertToModelMessages(
          request.messages as Parameters<typeof convertToModelMessages>[0],
        );
      } catch (error) {
        // The DTO only checks that `parts` is an array; convertToModelMessages does
        // the semantic validation. A structurally-valid-but-malformed payload is a
        // client error (400), not an internal failure (500).
        const detail =
          error instanceof Error ? error.message : "unknown conversion error";
        throw new BadRequestException(`Invalid \`messages\` payload: ${detail}`);
      }
    }
    if (request.prompt) {
      return [{ role: "user", content: request.prompt }];
    }
    throw new BadRequestException("Either `messages` or `prompt` is required.");
  }
}
