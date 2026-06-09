import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import oracledb from 'oracledb';

import type { AppConfig } from '../../config/configuration';

export const ORACLE_POOL = Symbol('ORACLE_POOL');

/**
 * The shared Oracle connection pool, or `null` when the ORACLE_* env vars are
 * unset. A null pool is a first-class state: the Oracle query tool reports a
 * clear "not configured" failure (ok:false) and the rest of the app still runs.
 */
export type OraclePool = oracledb.Pool | null;

/**
 * Validate an Oracle schema identifier before it is concatenated into an
 * `ALTER SESSION SET CURRENT_SCHEMA` statement. Schema/identifier names cannot
 * be passed as bind variables, so this regex is the injection guard. (It is
 * also enforced at the env-validation layer; this is defence-in-depth.)
 */
const SCHEMA_IDENTIFIER = /^[A-Za-z][A-Za-z0-9_$#]*$/;

export const oraclePoolProvider: Provider = {
  provide: ORACLE_POOL,
  inject: [ConfigService],
  useFactory: async (
    config: ConfigService<AppConfig, true>,
  ): Promise<OraclePool> => {
    const logger = new Logger('OraclePool');
    const oracle = config.get('oracle', { infer: true });

    // All-or-none: env.validation already enforces this, but guard here too so a
    // partially-configured environment degrades cleanly instead of half-connecting.
    if (!oracle.user || !oracle.password || !oracle.connectString) {
      logger.warn(
        'ORACLE_USER/ORACLE_PASSWORD/ORACLE_CONNECT_STRING not set — the Oracle query tool will report "not configured".',
      );
      return null;
    }

    // node-oracledb runs in *thin mode* by default (pure JS, no Oracle Instant
    // Client). We deliberately do NOT call initOracleClient(), so this works on
    // the Alpine runtime image and matches the simplest DBeaver "thin" setup.
    // CLOBs are fetched as strings so query results stay JSON-serializable for
    // the model (otherwise they arrive as Lob streams).
    oracledb.fetchAsString = [oracledb.CLOB];

    if (oracle.schema && !SCHEMA_IDENTIFIER.test(oracle.schema)) {
      // Should be unreachable (env.validation rejects it), but never inject an
      // unvalidated identifier into ALTER SESSION.
      throw new Error(`Invalid ORACLE_SCHEMA identifier: ${oracle.schema}`);
    }

    // Run once per brand-new pooled connection: scope unqualified table names to
    // the target schema, exactly like DBeaver's schema selector. Tag-less, so it
    // fires only on connection creation, not on every getConnection().
    const sessionCallback = oracle.schema
      ? async (connection: oracledb.Connection): Promise<void> => {
          await connection.execute(
            `ALTER SESSION SET CURRENT_SCHEMA = ${oracle.schema}`,
          );
        }
      : undefined;

    const pool = await oracledb.createPool({
      user: oracle.user,
      password: oracle.password,
      // A TNS alias from tnsnames.ora, an Easy Connect string (host:port/service),
      // or a full connect descriptor — all accepted by thin mode.
      connectString: oracle.connectString,
      // Directory containing tnsnames.ora / sqlnet.ora when connecting by TNS
      // alias (thin mode reads them from here). Equivalent to TNS_ADMIN.
      configDir: oracle.tnsAdmin,
      poolMin: 0,
      poolMax: 10,
      poolTimeout: 60,
      queueTimeout: 15_000,
      sessionCallback,
    });

    logger.log(
      `Oracle pool initialized (thin mode${oracle.schema ? `, schema=${oracle.schema}` : ''}).`,
    );
    return pool;
  },
};
