import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

import type { AppConfig } from '../config/configuration';

export const PG_POOL = Symbol('PG_POOL');

/**
 * The shared connection pool, or `null` when DATABASE_URL is unset. A null pool
 * is a first-class state: the database tool falls back to mock data and history
 * persistence is disabled, so the app still runs without Postgres.
 */
export type PgPool = pg.Pool | null;

export const pgPoolProvider: Provider = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfig, true>): PgPool => {
    const logger = new Logger('PgPool');
    const url = config.get('database', { infer: true }).url;

    if (!url) {
      logger.warn(
        'DATABASE_URL not set — sales tool returns mock data and chat history is disabled.',
      );
      return null;
    }

    logger.log('PostgreSQL pool initialized.');
    return new pg.Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
  },
};
