import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser, type AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentService } from './agent.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('agent')
@UseGuards(JwtAuthGuard)
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  async chat(
    @Body() body: ChatRequestDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!body.messages?.length && !body.prompt) {
      throw new BadRequestException('Either `messages` or `prompt` is required.');
    }
    await this.agent.streamChat(body, user, res);
  }
}
