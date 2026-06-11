import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

describe('App e2e', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';
    process.env.BEDROCK_KNOWLEDGE_BASE_ID =
      process.env.BEDROCK_KNOWLEDGE_BASE_ID ?? 'KB_TEST';
    process.env.POLICY_SERVICE_BASE_URL =
      process.env.POLICY_SERVICE_BASE_URL ?? 'https://policy.company.test';
    process.env.PARTY_SERVICE_BASE_URL =
      process.env.PARTY_SERVICE_BASE_URL ?? 'https://party.company.test';
    // Bypass JWT verification for e2e; the guard itself is unit-tested separately.
    process.env.AUTH_DISABLED = 'true';
    // Keep this e2e hermetic: don't connect to a real DB at boot (an empty value
    // is treated as "unset", so history is disabled and startup stays fast).
    process.env.DATABASE_URL = '';

    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns an ok status', async () => {
    const response = await request(baseUrl).get('/health').expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ok',
        uptimeSeconds: expect.any(Number),
        timestamp: expect.any(String),
      }),
    );
  });

  it('POST /agent/chat rejects empty requests before streaming', async () => {
    const response = await request(baseUrl)
      .post('/agent/chat')
      .send({})
      .expect(400);

    expect(response.body.message).toMatch(/messages|prompt/i);
  });
});
