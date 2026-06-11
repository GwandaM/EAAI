'use client';

import { DefaultChatTransport } from 'ai';
import {
  ArrowUp,
  Bot,
  Loader2,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  SquarePen,
  Trash2,
  UserRound,
} from 'lucide-react';
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '@ai-sdk/react';

import { AgentChart, type ChartSpec } from '@/components/agent-chart';
import { AgentDiagram, type DiagramSpec } from '@/components/agent-diagram';
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

// Sidebar layout, persisted across page refreshes.
const SIDEBAR_WIDTH_STORAGE_KEY = 'eaai.sidebarWidth';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'eaai.sidebarCollapsed';
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 288;

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width));
}

// The backend generates a summary title shortly after the first assistant
// reply; this delay covers that generation before re-fetching the list.
const TITLE_REFRESH_DELAY_MS = 3000;

const VISUALIZATION_PART_TYPES = ['tool-presentChart', 'tool-presentDiagram'];

// Extract a renderable spec from a presentChart/presentDiagram tool part.
// Returns null while the tool call is still streaming or if it failed
// (ok:false), in which case the generic tool indicator is shown instead.
function visualizationSpec(part: {
  type: string;
  state?: string;
  output?: unknown;
}): ChartSpec | DiagramSpec | null {
  if (part.state !== 'output-available') return null;
  const output = part.output as { ok?: boolean; data?: { kind?: string } } | undefined;
  if (output?.ok !== true || !output.data) return null;
  if (output.data.kind === 'chart') return output.data as ChartSpec;
  if (output.data.kind === 'diagram') return output.data as DiagramSpec;
  return null;
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
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const sidebarHydratedRef = useRef(false);

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

  // Restore the persisted sidebar layout (done post-mount to avoid an
  // SSR/client hydration mismatch on the inline width style).
  useEffect(() => {
    const storedWidth = Number(
      window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY),
    );
    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      setSidebarWidth(clampSidebarWidth(storedWidth));
    }
    setSidebarCollapsed(
      window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true',
    );
    sidebarHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!sidebarHydratedRef.current) return;
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      String(sidebarCollapsed),
    );
  }, [sidebarWidth, sidebarCollapsed]);

  // The backend summarizes untitled conversations after the assistant's reply,
  // so refresh the list when a stream finishes — once right away (updated_at
  // ordering) and once after the title generation has had time to land.
  const wasGeneratingRef = useRef(false);
  useEffect(() => {
    const wasGenerating = wasGeneratingRef.current;
    wasGeneratingRef.current = isGenerating;
    if (wasGenerating && !isGenerating) {
      void refreshConversations();
      const timer = setTimeout(
        () => void refreshConversations(),
        TITLE_REFRESH_DELAY_MS,
      );
      return () => clearTimeout(timer);
    }
  }, [isGenerating, refreshConversations]);

  const startSidebarResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsResizingSidebar(true);
      const onMove = (e: PointerEvent) => {
        // The sidebar starts at the viewport's left edge, so the pointer's
        // x-position is the desired width.
        setSidebarWidth(clampSidebarWidth(e.clientX));
      };
      const stop = () => {
        setIsResizingSidebar(false);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', stop);
        window.removeEventListener('pointercancel', stop);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
    },
    [],
  );

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

    // Lazily create a conversation on the first message of a new chat. It is
    // created untitled — the backend summarizes the first exchange into a
    // title once the assistant has replied.
    let id = conversationId;
    if (!id) {
      const created = await createConversation();
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
    <main
      className={cn(
        'flex h-screen bg-background text-foreground',
        isResizingSidebar && 'select-none',
      )}
    >
      {/* Conversation history sidebar (resizable; hidden when collapsed) */}
      {!sidebarCollapsed && (
      <aside
        style={{ width: sidebarWidth }}
        className="hidden shrink-0 flex-col bg-card md:flex"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            History
          </p>
          <div className="flex items-center gap-1">
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
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setSidebarCollapsed(true)}
              aria-label="Hide history pane"
              title="Hide history pane"
            >
              <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
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
      )}

      {/* Drag handle: doubles as the sidebar/chat divider. */}
      {!sidebarCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize history pane"
          onPointerDown={startSidebarResize}
          onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)}
          className={cn(
            'hidden w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/50 md:block',
            isResizingSidebar && 'bg-primary/50',
          )}
        />
      )}

      {/* Chat column */}
      <section
        className={cn(
          'mx-auto flex min-w-0 w-full flex-col px-4 py-5 sm:px-6 lg:px-8',
          // With the history pane hidden, let the chat use the full screen.
          sidebarCollapsed ? 'max-w-none' : 'max-w-5xl',
        )}
      >
        <header className="mb-5 flex items-center justify-between border-b border-border/70 pb-4">
          <div className="flex items-center gap-3">
            {sidebarCollapsed && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Show history pane"
                title="Show history pane"
                className="hidden md:inline-flex"
              >
                <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Invest Broker
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Broker Agent
              </h1>
            </div>
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
                    // Charts and diagrams need horizontal room; widen the bubble.
                    const hasVisualization = message.parts.some((part) =>
                      VISUALIZATION_PART_TYPES.includes(part.type),
                    );

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
                            'max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6',
                            hasVisualization
                              ? 'w-full sm:max-w-[86%]'
                              : 'sm:max-w-[74%]',
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

                            if (VISUALIZATION_PART_TYPES.includes(part.type)) {
                              const spec = visualizationSpec(part);
                              if (spec) {
                                return spec.kind === 'chart' ? (
                                  <AgentChart
                                    key={`${message.id}-${index}`}
                                    spec={spec}
                                  />
                                ) : (
                                  <AgentDiagram
                                    key={`${message.id}-${index}`}
                                    spec={spec}
                                  />
                                );
                              }
                              return (
                                <div
                                  key={`${message.id}-${index}`}
                                  className="text-xs font-medium text-muted-foreground"
                                >
                                  Preparing visualization...
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
