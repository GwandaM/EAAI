import { ConfigService } from '@nestjs/config';

import { BusinessApiService } from './business-api.service';
import type { BusinessToolContext } from './business-tool-context';

function fakeConfig(): ConfigService<unknown, true> {
  return {
    get: jest.fn((key: string) =>
      key === 'companyApi'
        ? { baseUrl: 'https://api.company.test/base', token: 'api-token' }
        : undefined,
    ),
  } as unknown as ConfigService<unknown, true>;
}

describe('BusinessApiService', () => {
  let fetchMock: jest.Mock;
  let originalFetch: typeof globalThis.fetch;

  const context: BusinessToolContext = {
    userId: 'user-123',
    email: 'broker@example.test',
    brokerId: 'broker-456',
    partyId: 'party-789',
  };

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ ok: true }),
    });
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('preserves base paths, encodes path segments, and forwards authenticated scope headers', async () => {
    const service = new BusinessApiService(fakeConfig());

    const out = await service.get(context, 'policy-service', 'getPolicy', [
      'policies',
      '../POL 123',
    ], { includeClosed: true });

    expect(out).toEqual({
      source: 'policy-service',
      operation: 'getPolicy',
      data: { ok: true },
    });
    const calledUrl = fetchMock.mock.calls[0][0] as URL;
    expect(calledUrl.toString()).toBe(
      'https://api.company.test/base/policies/..%2FPOL%20123?includeClosed=true',
    );

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer api-token');
    expect(headers['X-Authenticated-User-Id']).toBe('user-123');
    expect(headers['X-Authenticated-User-Email']).toBe('broker@example.test');
    expect(headers['X-Broker-Id']).toBe('broker-456');
    expect(headers['X-Party-Id']).toBe('party-789');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('POSTs JSON bodies to validation endpoints', async () => {
    const service = new BusinessApiService(fakeConfig());

    await service.post(context, 'party-service', 'validateRelationshipPath', [
      'relationships',
      'validate-path',
    ], { fromPartyId: 'A', toPartyId: 'B' });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"fromPartyId":"A","toPartyId":"B"}');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('throws on upstream failures so tool wrappers return ok:false', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
    } as never);

    const service = new BusinessApiService(fakeConfig());
    await expect(
      service.get(context, 'policy-service', 'getPolicy', ['policies', 'POL-1']),
    ).rejects.toThrow('Business API returned 403 Forbidden');
  });
});
