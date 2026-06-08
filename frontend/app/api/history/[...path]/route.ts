export const runtime = 'nodejs';

/**
 * Resolve the backend base URL. Prefer an explicit BACKEND_BASE_URL; otherwise
 * derive it from BACKEND_CHAT_URL (which points at `.../agent/chat`).
 */
function backendBaseUrl(): string | undefined {
  if (process.env.BACKEND_BASE_URL) {
    return process.env.BACKEND_BASE_URL.replace(/\/$/, '');
  }
  const chatUrl = process.env.BACKEND_CHAT_URL;
  if (!chatUrl) {
    return undefined;
  }
  return chatUrl.replace(/\/agent\/chat\/?$/, '');
}

async function proxy(
  request: Request,
  path: string[],
): Promise<Response> {
  const base = backendBaseUrl();
  if (!base) {
    return Response.json(
      { error: 'BACKEND_BASE_URL / BACKEND_CHAT_URL is not configured.' },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const target = `${base}/history/${path.join('/')}${incoming.search}`;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const authorization = request.headers.get('authorization');
  if (authorization) {
    headers.Authorization = authorization;
  }

  const hasBody = request.method !== 'GET' && request.method !== 'DELETE';
  if (hasBody) {
    headers['Content-Type'] =
      request.headers.get('content-type') ?? 'application/json';
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.text() : undefined,
  });

  const text = await upstream.text();
  return new Response(text || null, {
    status: upstream.status,
    headers: {
      'Content-Type':
        upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: Ctx) {
  return proxy(request, (await params).path);
}

export async function POST(request: Request, { params }: Ctx) {
  return proxy(request, (await params).path);
}

export async function DELETE(request: Request, { params }: Ctx) {
  return proxy(request, (await params).path);
}
