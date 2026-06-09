import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Accepts a UIMessage[] in the shape produced by Vercel AI SDK's `useChat()` hook
 * on the frontend. Each message has an `id`, `role`, and a `parts` array. We do
 * structural validation here and defer semantic validation to convertToModelMessages.
 */
export class UIMessageDto {
  @IsString()
  id!: string;

  @IsString()
  role!: 'user' | 'assistant' | 'system';

  @IsArray()
  parts!: unknown[];
}

export class ChatRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UIMessageDto)
  messages?: UIMessageDto[];

  /**
   * Convenience field for clients (e.g. curl) that don't want to construct a full
   * UIMessage[]. If provided, it is converted to a single user message server-side.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  prompt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  /**
   * Optional conversation to persist this turn into. Must be a conversation the
   * authenticated user owns; ignored if history persistence is disabled.
   */
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}
