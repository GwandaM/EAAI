import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

import type { AppConfig } from '../config/configuration';

export const PG_POOL = Symbol('PG_POOL');

/**
 * The shared connection pool, or `null` when DATABASE_URL is unset. A null pool
 * is a first-class state: history persistence is disabled, so the app still
 * runs without Postgres.
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
        'DATABASE_URL not set — chat history is disabled.',
      );
      return null;
    }

    // Managed/serverless Postgres (Neon, Supabase, RDS) requires TLS and can be
    // slow to accept the first connection (cold start), so enable SSL when the
    // URL asks for it and give the initial connect a generous timeout. These
    // providers use publicly-trusted certs, so we keep certificate verification
    // ON (do not set rejectUnauthorized:false — that would allow MITM).
    const needsSsl = /sslmode=require/i.test(url) || /\.neon\.tech/i.test(url);

    logger.log(
      `PostgreSQL pool initialized${needsSsl ? ' (SSL enabled)' : ''}.`,
    );
    return new pg.Pool({
      connectionString: url,
      ssl: needsSsl ? { rejectUnauthorized: true } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      keepAlive: true,
    });
  },
};
