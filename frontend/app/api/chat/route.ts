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

export async function POST(request: Request) {
  const backendChatUrl = process.env.BACKEND_CHAT_URL;

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

  const upstream = await fetch(backendChatUrl, {
    method: 'POST',
    headers,
    body: await request.text(),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyStreamHeaders(upstream.headers),
  });
}
