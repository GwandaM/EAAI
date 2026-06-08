import type { FactoryProvider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

import { pgPoolProvider } from './pg.provider';

function fakeConfig(databaseUrl?: string): ConfigService<unknown, true> {
  return {
    get: jest.fn((key: string) =>
      key === 'database' ? { url: databaseUrl } : undefined,
    ),
  } as unknown as ConfigService<unknown, true>;
}

const factory = (pgPoolProvider as FactoryProvider).useFactory as (
  config: ConfigService<unknown, true>,
) => pg.Pool | null;

describe('pgPoolProvider', () => {
  it('returns null and does not construct a pg.Pool when DATABASE_URL is unset', () => {
    const spy = jest.spyOn(pg, 'Pool');
    const pool = factory(fakeConfig(undefined));

    expect(pool).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('constructs a single pg.Pool when DATABASE_URL is present', () => {
    const spy = jest
      .spyOn(pg, 'Pool')
      .mockImplementation(() => ({}) as unknown as pg.Pool);
    const pool = factory(fakeConfig('postgres://test@host/db'));

    expect(pool).not.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
