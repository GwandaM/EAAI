'use client';

import { DefaultChatTransport } from 'ai';
import { ArrowUp, Bot, Loader2, UserRound } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useChat } from '@ai-sdk/react';

// Change this value if the backend is hosted elsewhere.
// Example: NEXT_PUBLIC_CHAT_API_URL="https://api.example.com/agent/chat"
const CHAT_API_ENDPOINT = process.env.NEXT_PUBLIC_CHAT_API_URL ?? '/api/chat';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-3 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>Thinking</span>
    </div>
  );
}

export default function Page() {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: CHAT_API_ENDPOINT }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({ transport });

  const isGenerating = status === 'submitted' || status === 'streaming';
  const hasMessages = messages.length > 0;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = input.trim();
    if (!text || isGenerating) {
      return;
    }

    sendMessage({ text });
    setInput('');
  }

  return (
    <main className="flex min-h-screen bg-surface text-ink">
      <section className="mx-auto flex w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between border-b border-line/70 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Enterprise AI
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Executive Agent
            </h1>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-muted shadow-sm ring-1 ring-line/80 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Streaming enabled
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-executive ring-1 ring-line/80">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            {!hasMessages ? (
              <div className="flex h-full min-h-[52vh] items-center justify-center">
                <div className="max-w-2xl text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 ring-1 ring-line">
                    <Bot className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    Ask about sales, products, policies, or internal knowledge.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-muted">
                    Responses stream from the Enterprise AI Agent and can include
                    citations or tool-backed context from your backend.
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
                      {!isUser && (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 ring-1 ring-line">
                          <Bot className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}

                      <div
                        className={cn(
                          'max-w-[86%] rounded-lg px-4 py-3 text-sm leading-6 sm:max-w-[74%]',
                          isUser
                            ? 'bg-neutral-900 text-white'
                            : 'bg-neutral-50 text-neutral-900 ring-1 ring-line/80',
                        )}
                      >
                        {message.parts.map((part, index) => {
                          if (part.type === 'text') {
                            return isUser ? (
                              <p key={`${message.id}-${index}`} className="whitespace-pre-wrap">
                                {part.text}
                              </p>
                            ) : (
                              <div key={`${message.id}-${index}`} className="markdown">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {part.text}
                                </ReactMarkdown>
                              </div>
                            );
                          }

                          return (
                            <div
                              key={`${message.id}-${index}`}
                              className="text-xs font-medium text-muted"
                            >
                              Consulting enterprise data...
                            </div>
                          );
                        })}
                      </div>

                      {isUser && (
                        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
                          <UserRound className="h-4 w-4" aria-hidden="true" />
                        </div>
                      )}
                    </article>
                  );
                })}

                {isGenerating && (
                  <article className="flex gap-3">
                    <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700 ring-1 ring-line">
                      <Bot className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="rounded-lg bg-neutral-50 px-4 py-3 ring-1 ring-line/80">
                      <ThinkingIndicator />
                    </div>
                  </article>
                )}

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    The agent could not complete the request. Check the backend
                    endpoint and server logs.
                  </div>
                )}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="border-t border-line/80 bg-white px-4 py-4 sm:px-6"
          >
            <div className="flex items-end gap-3">
              <label htmlFor="message" className="sr-only">
                Message
              </label>
              <textarea
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
                className="max-h-40 min-h-11 flex-1 resize-none rounded-md border border-line bg-surface px-4 py-3 text-sm outline-none transition placeholder:text-muted/70 focus:border-neutral-400 focus:bg-white focus:ring-4 focus:ring-neutral-200"
              />
              <button
                type="submit"
                disabled={!input.trim() || isGenerating}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-white transition hover:bg-neutral-700 focus:outline-none focus:ring-4 focus:ring-neutral-300 disabled:cursor-not-allowed disabled:bg-neutral-300"
                aria-label="Send message"
              >
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              Shift + Enter adds a new line.
            </p>
          </form>
        </div>
      </section>
    </main>
  );
}
