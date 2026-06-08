'use client';

import { DefaultChatTransport } from 'ai';
import { ArrowUp, Bot, Loader2, SquarePen, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '@ai-sdk/react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { createConversation, getConversation } from '@/lib/history';
import { cn } from '@/lib/utils';

// Change this value if the backend is hosted elsewhere.
// Example: NEXT_PUBLIC_CHAT_API_URL="https://api.example.com/agent/chat"
const CHAT_API_ENDPOINT = process.env.NEXT_PUBLIC_CHAT_API_URL ?? '/api/chat';

// Where we remember the active conversation across page refreshes.
const CONVERSATION_STORAGE_KEY = 'eaai.conversationId';

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
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: CHAT_API_ENDPOINT }),
    [],
  );

  const { messages, setMessages, sendMessage, status, error } = useChat({
    transport,
  });

  const isGenerating = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;

  // On first load, restore the saved conversation (so a refresh keeps history)
  // or create a fresh one. Persistence is best-effort: if history is disabled
  // server-side, the chat still works ephemerally.
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const savedId =
        typeof window !== 'undefined'
          ? window.localStorage.getItem(CONVERSATION_STORAGE_KEY)
          : null;

      if (savedId) {
        const conversation = await getConversation(savedId);
        if (cancelled) return;
        if (conversation) {
          setConversationId(conversation.id);
          setMessages(
            conversation.messages.map((m) => ({
              id: m.id,
              role: m.role,
              parts: m.parts,
            })) as typeof messages,
          );
          return;
        }
      }

      const created = await createConversation();
      if (cancelled || !created) return;
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, created.id);
      setConversationId(created.id);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  async function startNewChat() {
    if (isGenerating) {
      return;
    }
    const created = await createConversation();
    setMessages([]);
    if (created) {
      window.localStorage.setItem(CONVERSATION_STORAGE_KEY, created.id);
      setConversationId(created.id);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isGenerating) {
      return;
    }

    sendMessage(
      { text },
      conversationId ? { body: { conversationId } } : undefined,
    );
    setInput('');
  }

  return (
    <main className="flex min-h-screen bg-background text-foreground">
      <section className="mx-auto flex w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between border-b border-border/70 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Enterprise AI
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Executive Agent
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
                      Ask about sales, products, policies, or internal knowledge.
                    </h2>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      Responses stream from the Enterprise AI Agent and can
                      include citations or tool-backed context from your backend.
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
                                Consulting enterprise data...
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
                      The agent could not complete the request. Check the backend
                      endpoint and server logs.
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
                placeholder="Ask the agent..."
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
