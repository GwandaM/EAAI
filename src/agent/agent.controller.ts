import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { AgentService } from './agent.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('agent')
export class AgentController {
  constructor(private readonly agent: AgentService) {}

  @Post('chat')
  @HttpCode(HttpStatus.OK)
  chat(
    @Body() body: ChatRequestDto,
    @Res({ passthrough: false }) res: Response,
  ): void {
    if (!body.messages?.length && !body.prompt) {
      throw new BadRequestException('Either `messages` or `prompt` is required.');
    }
    this.agent.streamChat(body, res);
  }
}
