import { buildCompanyApiTool } from './company-api.tool';
import type { CompanyApiService } from './company-api.service';

const noopOptions = { toolCallId: 'tc-1', messages: [] } as never;

describe('buildCompanyApiTool', () => {
  it('exposes a description and inputSchema', () => {
    const svc = { getProduct: jest.fn() } as unknown as CompanyApiService;
    const t = buildCompanyApiTool(svc);
    expect(t.description).toMatch(/product/i);
    expect(t.inputSchema).toBeDefined();
  });

  it('returns ok:true with product data on success', async () => {
    const svc = {
      getProduct: jest.fn().mockResolvedValue({ product: { id: 'SKU-1' } }),
    } as unknown as CompanyApiService;

    const t = buildCompanyApiTool(svc);
    const out = await t.execute!({ productId: 'SKU-1' }, noopOptions);

    expect(out).toEqual({ ok: true, data: { product: { id: 'SKU-1' } } });
    expect(svc.getProduct).toHaveBeenCalledWith('SKU-1');
  });

  it('returns ok:false on service failure without throwing', async () => {
    const svc = {
      getProduct: jest.fn().mockRejectedValue(new Error('timeout')),
    } as unknown as CompanyApiService;

    const t = buildCompanyApiTool(svc);
    const out = await t.execute!({ productId: 'SKU-1' }, noopOptions);

    expect(out).toEqual({ ok: false, error: 'timeout' });
  });
});
