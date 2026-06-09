import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser, type AuthenticatedUser } from '../auth/authenticated-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { HistoryService } from './history.service';

@Controller('history')
@UseGuards(JwtAuthGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get('conversations')
  listConversations(@CurrentUser() user: AuthenticatedUser) {
    return this.history.listConversations(user.userId);
  }

  @Post('conversations')
  async createConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateConversationDto,
  ) {
    if (!this.history.enabled) {
      throw new ServiceUnavailableException(
        'Chat history persistence is not configured.',
      );
    }
    return this.history.createConversation(user.userId, body.title);
  }

  @Get('conversations/:id')
  async getConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const conversation = await this.history.getConversation(user.userId, id);
    if (!conversation) {
      throw new NotFoundException('Conversation not found.');
    }
    return conversation;
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<void> {
    const deleted = await this.history.deleteConversation(user.userId, id);
    if (!deleted) {
      throw new NotFoundException('Conversation not found.');
    }
  }
}
