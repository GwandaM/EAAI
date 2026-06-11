import {
  Inject,
  Injectable,
  Logger,
  type OnModuleInit,
} from '@nestjs/common';

import { PG_POOL, type PgPool } from './pg.provider';

export type StoredRole = 'user' | 'assistant' | 'system';

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredMessage {
  id: string;
  role: StoredRole;
  parts: unknown[];
  createdAt: string;
}

export interface Conversation extends ConversationSummary {
  messages: StoredMessage[];
}

const SCHEMA_SQL = `
  create table if not exists conversations (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    title text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index if not exists conversations_user_idx
    on conversations (user_id, updated_at desc);

  create table if not exists messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references conversations (id) on delete cascade,
    role text not null,
    parts jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
  );
  create index if not exists messages_conversation_idx
    on messages (conversation_id, created_at asc);
`;

@Injectable()
export class HistoryService implements OnModuleInit {
  private readonly logger = new Logger(HistoryService.name);

  constructor(@Inject(PG_POOL) private readonly pool: PgPool) {}

  get enabled(): boolean {
    return this.pool !== null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      return;
    }
    try {
      await this.pool.query(SCHEMA_SQL);
      this.logger.log('Chat history schema ready.');
    } catch (error) {
      // Don't crash the app if schema bootstrap fails (e.g. read-only role) —
      // history just stays unavailable and the rest of the app keeps working.
      this.logger.error(
        `Failed to ensure history schema: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async listConversations(userId: string): Promise<ConversationSummary[]> {
    if (!this.pool) {
      return [];
    }
    const { rows } = await this.pool.query(
      `select id, title, created_at, updated_at
         from conversations
        where user_id = $1
        order by updated_at desc
        limit 100`,
      [userId],
    );
    return rows.map(toSummary);
  }

  async getConversation(
    userId: string,
    conversationId: string,
  ): Promise<Conversation | null> {
    if (!this.pool) {
      return null;
    }
    const convo = await this.pool.query(
      `select id, title, created_at, updated_at
         from conversations
        where id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    if (convo.rowCount === 0) {
      return null;
    }
    const messages = await this.pool.query(
      `select id, role, parts, created_at
         from messages
        where conversation_id = $1
        order by created_at asc`,
      [conversationId],
    );
    return {
      ...toSummary(convo.rows[0]),
      messages: messages.rows.map(toMessage),
    };
  }

  async createConversation(
    userId: string,
    title?: string | null,
  ): Promise<ConversationSummary> {
    this.assertEnabled();
    const { rows } = await this.pool!.query(
      `insert into conversations (user_id, title)
       values ($1, $2)
       returning id, title, created_at, updated_at`,
      [userId, title ?? null],
    );
    return toSummary(rows[0]);
  }

  async deleteConversation(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    if (!this.pool) {
      return false;
    }
    const { rowCount } = await this.pool.query(
      `delete from conversations where id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** Whether the conversation exists, is owned by userId, and has no title yet. */
  async conversationNeedsTitle(
    userId: string,
    conversationId: string,
  ): Promise<boolean> {
    if (!this.pool) {
      return false;
    }
    const { rows, rowCount } = await this.pool.query(
      `select title from conversations where id = $1 and user_id = $2`,
      [conversationId, userId],
    );
    return (rowCount ?? 0) > 0 && rows[0].title === null;
  }

  /**
   * Set the title only if it is still unset, so a concurrent rename (or a
   * second in-flight summary) never overwrites an existing title.
   */
  async setTitleIfUnset(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<boolean> {
    if (!this.pool) {
      return false;
    }
    const { rowCount } = await this.pool.query(
      `update conversations set title = $3
        where id = $1 and user_id = $2 and title is null`,
      [conversationId, userId, title],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * Append a message to a conversation the user owns, bumping its updated_at.
   * Returns false if the conversation does not exist or is not owned by userId
   * (so callers never write into someone else's conversation).
   */
  async appendMessage(
    userId: string,
    conversationId: string,
    role: StoredRole,
    parts: unknown[],
  ): Promise<boolean> {
    if (!this.pool) {
      return false;
    }
    const owned = await this.pool.query(
      `update conversations set updated_at = now()
        where id = $1 and user_id = $2
        returning id`,
      [conversationId, userId],
    );
    if (owned.rowCount === 0) {
      return false;
    }
    await this.pool.query(
      `insert into messages (conversation_id, role, parts)
       values ($1, $2, $3::jsonb)`,
      [conversationId, role, JSON.stringify(parts)],
    );
    return true;
  }

  private assertEnabled(): void {
    if (!this.pool) {
      throw new Error('History persistence is not configured (no DATABASE_URL).');
    }
  }
}

interface ConversationRow {
  id: string;
  title: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MessageRow {
  id: string;
  role: string;
  parts: unknown;
  created_at: Date | string;
}

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    role: row.role as StoredRole,
    parts: Array.isArray(row.parts) ? row.parts : [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}
