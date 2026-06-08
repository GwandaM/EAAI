const backendUrl = process.env.BACKEND_URL ?? 'http://127.0.0.1:3000';
const frontendUrl = process.env.FRONTEND_URL ?? 'http://127.0.0.1:3001';

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function assertResponse(label, request, expectedStatus) {
  const response = await request();
  const body = await readJson(response);

  if (response.status !== expectedStatus) {
    throw new Error(
      `${label} expected ${expectedStatus}, received ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body;
}

await assertResponse(
  'backend health',
  () => fetch(`${backendUrl}/health`),
  200,
);

await assertResponse(
  'frontend page',
  () => fetch(frontendUrl),
  200,
);

await assertResponse(
  'frontend chat proxy',
  () =>
    fetch(`${frontendUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }),
  400,
);

console.log('Production smoke checks passed.');
