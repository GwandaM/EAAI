'use client';

import { DefaultChatTransport } from 'ai';
import {
  ArrowUp,
  Bot,
  Loader2,
  MessageSquare,
  SquarePen,
  Trash2,
  UserRound,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '@ai-sdk/react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  type ConversationSummary,
} from '@/lib/history';
import { cn } from '@/lib/utils';

// Change this value if the backend is hosted elsewhere.
// Example: NEXT_PUBLIC_CHAT_API_URL="https://api.example.com/agent/chat"
const CHAT_API_ENDPOINT = process.env.NEXT_PUBLIC_CHAT_API_URL ?? '/api/chat';

// Where we remember the active conversation across page refreshes.
const CONVERSATION_STORAGE_KEY = 'eaai.conversationId';

function titleFromText(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>Thinking</span>
    </div>
  );
}

function AssistantAvatar() {
  return (
    <Avatar className="mt-1 h-8 w-8 ring-1 ring-border">
      <AvatarFallback className="bg-secondary text-secondary-foreground">
        <Bot className="h-4 w-4" aria-hidden="true" />
      </AvatarFallback>
    </Avatar>
  );
}

export default function Page() {
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: CHAT_API_ENDPOINT }),
    [],
  );

  const { messages, setMessages, sendMessage, status, error } = useChat({
    transport,
    onError: (chatError) => {
      // Keep the full error (incl. stack) in devtools; the banner shows message only.
      console.error('[chat] request failed:', chatError);
    },
  });

  const isGenerating = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;

  const refreshConversations = useCallback(async () => {
    setConversations(await listConversations());
  }, []);

  function hydrate(id: string, msgs: { id: string; role: string; parts: unknown[] }[]) {
    setConversationId(id);
    window.localStorage.setItem(CONVERSATION_STORAGE_KEY, id);
    setMessages(
      msgs.map((m) => ({ id: m.id, role: m.role, parts: m.parts })) as typeof messages,
    );
  }

  // On first load, list conversations and restore the last one (if any).
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      await refreshConversations();
      const savedId = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (savedId) {
        const conversation = await getConversation(savedId);
        if (!cancelled && conversation) {
          hydrate(conversation.id, conversation.messages);
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshConversations]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  function startNewChat() {
    if (isGenerating) return;
    setMessages([]);
    setConversationId(null);
    window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
  }

  async function openConversation(id: string) {
    if (isGenerating || id === conversationId) return;
    const conversation = await getConversation(id);
    if (conversation) {
      hydrate(conversation.id, conversation.messages);
    }
  }

  async function removeConversation(id: string) {
    await deleteConversation(id);
    if (id === conversationId) {
      startNewChat();
    }
    await refreshConversations();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isGenerating) return;

    // Lazily create a titled conversation on the first message of a new chat.
    let id = conversationId;
    if (!id) {
      const created = await createConversation(titleFromText(text));
      if (created) {
        id = created.id;
        setConversationId(created.id);
        window.localStorage.setItem(CONVERSATION_STORAGE_KEY, created.id);
        void refreshConversations();
      }
    }

    sendMessage({ text }, id ? { body: { conversationId: id } } : undefined);
    setInput('');
  }

  return (
    <main className="flex h-screen bg-background text-foreground">
      {/* Conversation history sidebar */}
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            History
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={startNewChat}
            disabled={isGenerating}
          >
            <SquarePen className="h-4 w-4" aria-hidden="true" />
            New
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-1 p-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No conversations yet.
              </p>
            ) : (
              conversations.map((c) => {
                const active = c.id === conversationId;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors',
                      active
                        ? 'bg-secondary text-secondary-foreground'
                        : 'hover:bg-secondary/60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => openConversation(c.id)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <MessageSquare
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">
                        {c.title ?? 'New conversation'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeConversation(c.id)}
                      aria-label="Delete conversation"
                      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition hover:text-destructive group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Chat column */}
      <section className="mx-auto flex w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between border-b border-border/70 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Invest Broker
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Broker Agent
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="hidden px-3 py-1.5 sm:inline-flex"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Streaming enabled
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startNewChat}
              disabled={isGenerating}
              className="md:hidden"
            >
              <SquarePen className="h-4 w-4" aria-hidden="true" />
              New chat
            </Button>
          </div>
        </header>

        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-executive">
          <ScrollArea className="min-h-0 flex-1">
            <div className="px-4 py-6 sm:px-8">
              {!hasMessages ? (
                <div className="flex h-full min-h-[52vh] items-center justify-center">
                  <div className="max-w-2xl text-center">
                    <Avatar className="mx-auto mb-5 h-12 w-12 ring-1 ring-border">
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        <Bot className="h-6 w-6" aria-hidden="true" />
                      </AvatarFallback>
                    </Avatar>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      Ask about policies, clients, broker summaries, or internal knowledge.
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Responses stream from the Invest Broker Agent with citations
                      from policy, party, and knowledge-base tools.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-7">
                  {messages.map((message) => {
                    const isUser = message.role === 'user';

                    return (
                      <article
                        key={message.id}
                        className={cn(
                          'flex gap-3',
                          isUser ? 'justify-end' : 'justify-start',
                        )}
                      >
                        {!isUser && <AssistantAvatar />}

                        <div
                          className={cn(
                            'max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 sm:max-w-[74%]',
                            isUser
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground ring-1 ring-border/80',
                          )}
                        >
                          {message.parts.map((part, index) => {
                            if (part.type === 'text') {
                              return isUser ? (
                                <p
                                  key={`${message.id}-${index}`}
                                  className="whitespace-pre-wrap"
                                >
                                  {part.text}
                                </p>
                              ) : (
                                <div
                                  key={`${message.id}-${index}`}
                                  className="markdown"
                                >
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {part.text}
                                  </ReactMarkdown>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={`${message.id}-${index}`}
                                className="text-xs font-medium text-muted-foreground"
                              >
                                Consulting broker data...
                              </div>
                            );
                          })}
                        </div>

                        {isUser && (
                          <Avatar className="mt-1 h-8 w-8">
                            <AvatarFallback className="bg-primary text-primary-foreground">
                              <UserRound className="h-4 w-4" aria-hidden="true" />
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </article>
                    );
                  })}

                  {isGenerating && (
                    <article className="flex gap-3">
                      <AssistantAvatar />
                      <div className="rounded-lg bg-secondary px-4 py-3 ring-1 ring-border/80">
                        <ThinkingIndicator />
                      </div>
                    </article>
                  )}

                  {error && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      <p className="font-medium">
                        The agent could not complete the request.
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words">
                        {error.message ||
                          'No error details were provided. Check the backend endpoint and server logs.'}
                      </p>
                    </div>
                  )}

                  <div ref={bottomRef} />
                </div>
              )}
            </div>
          </ScrollArea>

          <form
            onSubmit={handleSubmit}
            className="border-t border-border bg-card px-4 py-4 sm:px-6"
          >
            <div className="flex items-end gap-3">
              <label htmlFor="message" className="sr-only">
                Message
              </label>
              <Textarea
                id="message"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Ask the broker agent..."
                rows={1}
                className="max-h-40 min-h-11 flex-1 resize-none"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isGenerating}
                className="h-11 w-11 shrink-0"
                aria-label="Send message"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Shift + Enter adds a new line.
            </p>
          </form>
        </Card>
      </section>
    </main>
  );
}
