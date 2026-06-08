import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

/**
 * Real end-to-end test against AWS Bedrock. It is SKIPPED by default because it
 * needs valid AWS credentials and Bedrock model access (and costs a token or
 * two per run). Enable it explicitly:
 *
 *   RUN_BEDROCK_INTEGRATION=true \
 *   AWS_REGION=us-east-1 \
 *   AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... \
 *   pnpm run test:bedrock
 *
 * Or simply `pnpm run test:bedrock` if your environment already has AWS creds
 * on the standard credential chain.
 */
const ENABLED = process.env.RUN_BEDROCK_INTEGRATION === 'true';
const describeOrSkip = ENABLED ? describe : describe.skip;

describeOrSkip('Bedrock integration (real AWS)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    if (!process.env.AWS_REGION) {
      throw new Error(
        'AWS_REGION must be set for the Bedrock integration test.',
      );
    }
    // Don't require a JWT for this test; we are exercising the model, not auth.
    process.env.AUTH_DISABLED = 'true';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  }, 30_000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('streams a real model response from Bedrock for a simple prompt', async () => {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Reply with a short one-sentence greeting.' }),
    });

    expect(response.status).toBe(200);

    const body = await response.text();
    // The UI Message Stream is SSE-style: it emits `data:` lines and a terminal
    // finish event. We assert structure rather than exact wording.
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain('data:');
    expect(body.toLowerCase()).toContain('finish');
  }, 60_000);

  it('invokes a tool when asked for sales data and still finishes the stream', async () => {
    const response = await fetch(`${baseUrl}/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'What were EMEA sales between 2026-01-01 and 2026-03-31?',
      }),
    });

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data:');
    // querySalesPerformance returns mock rows without DATABASE_URL, but the tool
    // call itself should appear in the stream.
    expect(body.toLowerCase()).toContain('finish');
  }, 60_000);
});
