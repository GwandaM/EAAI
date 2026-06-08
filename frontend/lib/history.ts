export type StoredRole = 'user' | 'assistant' | 'system';

export interface StoredMessage {
  id: string;
  role: StoredRole;
  parts: unknown[];
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation extends ConversationSummary {
  messages: StoredMessage[];
}

const HISTORY_BASE = '/api/history';

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${HISTORY_BASE}/conversations`);
  if (!res.ok) {
    return [];
  }
  return (await res.json()) as ConversationSummary[];
}

export async function deleteConversation(id: string): Promise<boolean> {
  const res = await fetch(`${HISTORY_BASE}/conversations/${id}`, {
    method: 'DELETE',
  });
  return res.ok;
}

export async function createConversation(
  title?: string,
): Promise<ConversationSummary | null> {
  const res = await fetch(`${HISTORY_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(title ? { title } : {}),
  });
  // 503 means history isn't configured on the backend — treat as "no history".
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as ConversationSummary;
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const res = await fetch(`${HISTORY_BASE}/conversations/${id}`);
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as Conversation;
}
