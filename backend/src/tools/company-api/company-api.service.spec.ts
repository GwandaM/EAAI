import { ConfigService } from '@nestjs/config';

import { CompanyApiService } from './company-api.service';

function fakeConfig(
  overrides: Partial<{ baseUrl: string; token: string | undefined }> = {},
): ConfigService<unknown, true> {
  const companyApi = {
    baseUrl: 'https://api.company.com',
    token: 'super-secret',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => (key === 'companyApi' ? companyApi : undefined)),
  } as unknown as ConfigService<unknown, true>;
}

describe('CompanyApiService', () => {
  let fetchMock: jest.Mock;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = jest.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('accuracy', () => {
    it('returns the parsed JSON body wrapped as { product }', async () => {
      const body = { id: 'SKU-42', price: 19.99, name: 'Widget' };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(body),
      } as never);

      const svc = new CompanyApiService(fakeConfig());
      const result = await svc.getProduct('SKU-42');

      expect(result).toEqual({ product: body });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('security', () => {
    it('URL-encodes the productId so values like ../admin cannot escape the path', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({}),
      } as never);

      const svc = new CompanyApiService(fakeConfig());
      await svc.getProduct('../admin/users');

      const calledUrl = fetchMock.mock.calls[0][0] as URL;
      expect(calledUrl.toString()).toBe(
        'https://api.company.com/products/..%2Fadmin%2Fusers',
      );
    });

    it('sends the Authorization Bearer header when a token is configured', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({}),
      } as never);

      const svc = new CompanyApiService(fakeConfig({ token: 'my-token' }));
      await svc.getProduct('SKU-1');

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer my-token');
      expect(headers.Accept).toBe('application/json');
    });

    it('does NOT send Authorization header when no token is configured', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({}),
      } as never);

      const svc = new CompanyApiService(fakeConfig({ token: undefined }));
      await svc.getProduct('SKU-1');

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBeUndefined();
    });

    it('attaches an AbortSignal so a hung upstream cannot deadlock the agent', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({}),
      } as never);

      const svc = new CompanyApiService(fakeConfig());
      await svc.getProduct('SKU-1');

      const init = fetchMock.mock.calls[0][1] as RequestInit;
      expect(init.signal).toBeInstanceOf(AbortSignal);
    });
  });

  describe('error handling', () => {
    it('throws on non-2xx responses so the tool wrapper can surface ok:false', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as never);

      const svc = new CompanyApiService(fakeConfig());
      await expect(svc.getProduct('missing')).rejects.toThrow(
        'Company API returned 404 Not Found',
      );
    });

    it('propagates network errors from fetch', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      const svc = new CompanyApiService(fakeConfig());
      await expect(svc.getProduct('SKU-1')).rejects.toThrow('ECONNREFUSED');
    });
  });
});
