import { buildDatabaseTool } from './database.tool';
import type { DatabaseService } from './database.service';

const noopOptions = { toolCallId: 'tc-1', messages: [] } as never;

describe('buildDatabaseTool', () => {
  it('exposes a description and inputSchema for the model', () => {
    const svc = { querySales: jest.fn() } as unknown as DatabaseService;
    const t = buildDatabaseTool(svc);
    expect(t.description).toMatch(/sales|performance/i);
    expect(t.inputSchema).toBeDefined();
  });

  it('returns ok:true with the rows on success', async () => {
    const svc = {
      querySales: jest.fn().mockResolvedValue({
        source: 'mock',
        rows: [{ record_date: '2026-03-31', product_id: 'X', region: 'EMEA', metric_value: 100 }],
      }),
    } as unknown as DatabaseService;

    const t = buildDatabaseTool(svc);
    const out = await t.execute!(
      {
        metric: 'sales',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        region: 'EMEA',
      },
      noopOptions,
    );

    expect(out).toEqual({
      ok: true,
      data: expect.objectContaining({ source: 'mock' }),
    });
  });

  it('returns ok:false when the service throws (never propagates)', async () => {
    const svc = {
      querySales: jest.fn().mockRejectedValue(new Error('connection terminated')),
    } as unknown as DatabaseService;

    const t = buildDatabaseTool(svc);
    const out = await t.execute!(
      {
        metric: 'sales',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      },
      noopOptions,
    );

    expect(out).toEqual({ ok: false, error: 'connection terminated' });
  });
});
