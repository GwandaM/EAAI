import oracledb from 'oracledb';

import { OracleService } from './oracle.service';
import type { OraclePool } from './oracle.provider';

type ConnectionStub = {
  execute: jest.Mock;
  close: jest.Mock;
  callTimeout?: number;
};

type PoolStub = { getConnection: jest.Mock };

function poolReturning(connection: ConnectionStub): { service: OracleService; pool: PoolStub } {
  const pool: PoolStub = {
    getConnection: jest.fn().mockResolvedValue(connection),
  };
  return { service: new OracleService(pool as unknown as OraclePool), pool };
}

describe('OracleService — not configured (no pool)', () => {
  it('throws a clear "not configured" error so the tool reports ok:false', async () => {
    const svc = new OracleService(null);
    await expect(svc.query({ sql: 'select 1 from dual' })).rejects.toThrow(
      /not configured/i,
    );
  });
});

describe('OracleService — read-only enforcement (security)', () => {
  const cases: Array<[string, string]> = [
    ['UPDATE policy_doc SET status = 1', 'read-only'],
    ['DELETE FROM policy_doc', 'read-only'],
    ['INSERT INTO audit VALUES (1)', 'read-only'],
    ['DROP TABLE policy_doc', 'read-only'],
    ['ALTER SESSION SET CURRENT_SCHEMA = EVIL', 'read-only'],
    ['BEGIN proc END', 'read-only'],
    ['select 1 from dual; drop table x', 'single statement'],
    ['   ', 'empty'],
  ];

  it.each(cases)('rejects %j without touching the pool', async (sql, expected) => {
    const connection: ConnectionStub = { execute: jest.fn(), close: jest.fn() };
    const { service, pool } = poolReturning(connection);

    await expect(service.query({ sql })).rejects.toThrow(new RegExp(expected, 'i'));
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  it('allows a leading comment before SELECT', async () => {
    const connection: ConnectionStub = {
      execute: jest.fn().mockResolvedValue({ rows: [{ N: 1 }] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = poolReturning(connection);

    const out = await service.query({ sql: '/* report */ select 1 as n from dual' });
    expect(out.rows).toEqual([{ N: 1 }]);
  });

  it('allows WITH (CTE) queries', async () => {
    const connection: ConnectionStub = {
      execute: jest.fn().mockResolvedValue({ rows: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = poolReturning(connection);

    await expect(
      service.query({ sql: 'with t as (select 1 n from dual) select * from t' }),
    ).resolves.toBeDefined();
  });
});

describe('OracleService — query execution', () => {
  it('passes binds through untouched and requests OBJECT output + a row cap', async () => {
    const connection: ConnectionStub = {
      execute: jest.fn().mockResolvedValue({ rows: [{ ID: 7 }] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = poolReturning(connection);

    const hostile = "1'); DROP TABLE policy_doc; --";
    await service.query({
      sql: 'select * from policy_doc where id = :id',
      binds: { id: hostile },
    });

    expect(connection.execute).toHaveBeenCalledTimes(1);
    const [sql, binds, options] = connection.execute.mock.calls[0];
    // The hostile value lives only in binds — never inlined into the SQL string.
    expect(sql).toBe('select * from policy_doc where id = :id');
    expect(binds).toEqual({ id: hostile });
    expect(options.outFormat).toBe(oracledb.OUT_FORMAT_OBJECT);
    expect(options.maxRows).toBeGreaterThan(0);
  });

  it('strips a single trailing semicolon before executing', async () => {
    const connection: ConnectionStub = {
      execute: jest.fn().mockResolvedValue({ rows: [] }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = poolReturning(connection);

    await service.query({ sql: 'select 1 from dual;' });
    expect(connection.execute.mock.calls[0][0]).toBe('select 1 from dual');
  });

  it('flags truncated:true when the row cap is hit', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ N: i }));
    const connection: ConnectionStub = {
      execute: jest.fn().mockResolvedValue({ rows }),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = poolReturning(connection);

    const out = await service.query({ sql: 'select n from big' });
    expect(out.rowCount).toBe(200);
    expect(out.truncated).toBe(true);
  });

  it('returns the connection to the pool even when the query throws', async () => {
    const connection: ConnectionStub = {
      execute: jest.fn().mockRejectedValue(new Error('ORA-00942: table or view does not exist')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = poolReturning(connection);

    await expect(service.query({ sql: 'select * from missing' })).rejects.toThrow(
      /ORA-00942/,
    );
    expect(connection.close).toHaveBeenCalledTimes(1);
  });
});
