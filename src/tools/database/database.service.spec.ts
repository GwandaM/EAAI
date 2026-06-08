import type { PgPool } from '../../persistence/pg.provider';
import { DatabaseService } from './database.service';

type PoolStub = { query: jest.Mock };

function withPool(pool: PoolStub): DatabaseService {
  return new DatabaseService(pool as unknown as PgPool);
}

describe('DatabaseService — mock fallback (no pool)', () => {
  describe('accuracy', () => {
    it('returns mock rows tagged with source:"mock" when there is no pool', async () => {
      const svc = new DatabaseService(null);
      const out = await svc.querySales({
        metric: 'revenue',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      });

      expect(out.source).toBe('mock');
      expect(out.rows.length).toBeGreaterThan(0);
      expect(out.rows[0]).toEqual(
        expect.objectContaining({
          record_date: '2026-03-31',
          product_id: expect.any(String),
          region: expect.any(String),
          metric_value: expect.any(Number),
        }),
      );
    });

    it('honours the region filter in mock mode (single row per region)', async () => {
      const svc = new DatabaseService(null);
      const out = await svc.querySales({
        metric: 'sales',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        region: 'EMEA',
      });

      expect(out.rows).toHaveLength(1);
      expect(out.rows[0].region).toBe('EMEA');
    });

    it('honours the productId filter in mock mode', async () => {
      const svc = new DatabaseService(null);
      const out = await svc.querySales({
        metric: 'units_sold',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        productId: 'SKU-XYZ',
      });

      expect(out.rows.every((r) => r.product_id === 'SKU-XYZ')).toBe(true);
    });
  });

  describe('security', () => {
    it('rejects an unsupported metric value even if it somehow bypasses the zod schema', async () => {
      const pool: PoolStub = { query: jest.fn().mockResolvedValue({ rows: [] }) };
      const svc = withPool(pool);

      await expect(
        svc.querySales({
          metric: 'DROP TABLE sales; --' as never,
          startDate: '2026-01-01',
          endDate: '2026-03-31',
        }),
      ).rejects.toThrow(/Unsupported metric/);

      expect(pool.query).not.toHaveBeenCalled();
    });
  });
});

describe('DatabaseService — postgres path', () => {
  it('uses parameterized $1, $2, ... placeholders (no user input in SQL string)', async () => {
    const pool: PoolStub = {
      query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    };
    const svc = withPool(pool);

    await svc.querySales({
      metric: 'revenue',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
      productId: "SKU-1'); DROP TABLE sales_performance; --",
      region: 'EMEA',
    });

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = pool.query.mock.calls[0];
    // The hostile productId must show up only in the values array — never inlined.
    expect(values).toEqual([
      '2026-01-01',
      '2026-03-31',
      "SKU-1'); DROP TABLE sales_performance; --",
      'EMEA',
    ]);
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).toContain('$3');
    expect(sql).toContain('$4');
    expect(sql).not.toContain('DROP TABLE');
  });

  it('falls back to mock rows when the sales_performance table is missing (pg code 42P01)', async () => {
    const error = Object.assign(
      new Error('relation "sales_performance" does not exist'),
      { code: '42P01' },
    );
    const pool: PoolStub = { query: jest.fn().mockRejectedValue(error) };
    const svc = withPool(pool);

    const out = await svc.querySales({
      metric: 'sales',
      startDate: '2026-01-01',
      endDate: '2026-03-31',
    });

    expect(out.source).toBe('mock');
    expect(out.rows.length).toBeGreaterThan(0);
  });

  it('re-throws non-recoverable pg errors so the tool wrapper can surface ok:false', async () => {
    const error = Object.assign(new Error('connection terminated'), {
      code: '57P01',
    });
    const pool: PoolStub = { query: jest.fn().mockRejectedValue(error) };
    const svc = withPool(pool);

    await expect(
      svc.querySales({
        metric: 'sales',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
      }),
    ).rejects.toThrow('connection terminated');
  });
});
