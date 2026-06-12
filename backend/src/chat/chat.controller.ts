import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { AgentService } from '../agent/agent.service';
import { ChatRequestDto } from '../agent/dto/chat-request.dto';
import { CurrentUser, type AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly agent: AgentService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body() body: ChatRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // `messages`/`prompt` presence is enforced in AgentService.normalizeMessages
    // (it throws BadRequestException), so no duplicate check here.
    await this.agent.streamChat(body, user, res);
  }
}
