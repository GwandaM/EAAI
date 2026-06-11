export const runtime = 'nodejs';

const STREAM_HEADERS = [
  'cache-control',
  'content-encoding',
  'content-type',
  'transfer-encoding',
  'vary',
];

function copyStreamHeaders(source: Headers): Headers {
  const headers = new Headers();

  for (const header of STREAM_HEADERS) {
    const value = source.get(header);
    if (value) {
      headers.set(header, value);
    }
  }

  return headers;
}

// In development, fall back to the local backend so the app works even when
// the servers are started separately (without scripts/dev.mjs wiring the env).
const DEV_BACKEND_CHAT_URL = 'http://localhost:3000/agent/chat';

export async function POST(request: Request) {
  const backendChatUrl =
    process.env.BACKEND_CHAT_URL ??
    (process.env.NODE_ENV !== 'production' ? DEV_BACKEND_CHAT_URL : undefined);

  if (!backendChatUrl) {
    return Response.json(
      { error: 'BACKEND_CHAT_URL is not configured.' },
      { status: 503 },
    );
  }

  const headers: Record<string, string> = {
    'Content-Type': request.headers.get('content-type') ?? 'application/json',
    Accept: request.headers.get('accept') ?? '*/*',
  };

  // Forward the caller's bearer token so the backend JwtAuthGuard can verify it.
  const authorization = request.headers.get('authorization');
  if (authorization) {
    headers.Authorization = authorization;
  }

  let upstream: Response;
  try {
    upstream = await fetch(backendChatUrl, {
      method: 'POST',
      headers,
      body: await request.text(),
    });
  } catch (error) {
    // Node's fetch wraps connection errors ("fetch failed") with the real
    // reason (ECONNREFUSED, ENOTFOUND, …) in `cause` — surface both.
    const detail =
      error instanceof Error
        ? [error.message, error.cause instanceof Error ? error.cause.message : null]
            .filter(Boolean)
            .join(' — ')
        : String(error);
    console.error(`[api/chat] Could not reach backend at ${backendChatUrl}:`, error);
    return Response.json(
      { error: `Could not reach backend at ${backendChatUrl}: ${detail}` },
      { status: 502 },
    );
  }

  // An HTML 404 means whatever answered is not the NestJS backend — typically
  // this Next.js dev server proxying to itself because it took port 3000
  // (started standalone before/without the backend). Surface that instead of
  // passing the confusing 404 through to useChat.
  if (
    upstream.status === 404 &&
    (upstream.headers.get('content-type') ?? '').includes('text/html')
  ) {
    return Response.json(
      {
        error:
          `No backend found at ${backendChatUrl} (got an HTML 404 — likely this ` +
          'Next.js server answering its own proxy request). Start the NestJS ' +
          'backend on port 3000 (`npm run dev` or `npm run start:dev` from the ' +
          'repo root) or set BACKEND_CHAT_URL.',
      },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyStreamHeaders(upstream.headers),
  });
}
