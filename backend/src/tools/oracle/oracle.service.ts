import { Inject, Injectable, Logger } from '@nestjs/common';
import oracledb from 'oracledb';

import { ORACLE_POOL, type OraclePool } from './oracle.provider';

/**
 * Bind values we allow the model to supply for `:name` placeholders. Oracle SQL
 * has no native boolean bind type, so we accept only string / number / null.
 */
export type OracleBindValue = string | number | null;

export interface OracleQueryInput {
  sql: string;
  binds?: Record<string, OracleBindValue>;
}

export interface OracleQueryOutput {
  rowCount: number;
  /** True when the result hit MAX_ROWS and more rows may exist. */
  truncated: boolean;
  rows: Record<string, unknown>[];
}

/** Hard cap on rows returned to the model, to bound payload + token cost. */
const MAX_ROWS = 200;

/** Abort queries that run longer than this (ms) so one bad query can't hang the pool. */
const QUERY_TIMEOUT_MS = 30_000;

@Injectable()
export class OracleService {
  private readonly logger = new Logger(OracleService.name);

  constructor(@Inject(ORACLE_POOL) private readonly pool: OraclePool) {}

  async query(input: OracleQueryInput): Promise<OracleQueryOutput> {
    if (!this.pool) {
      // Expected state when ORACLE_* is unset — surface it as a tool failure so
      // the model explains the limitation (per the system prompt) instead of
      // the request 500-ing.
      throw new Error(
        'Oracle is not configured. Set ORACLE_USER, ORACLE_PASSWORD and ORACLE_CONNECT_STRING.',
      );
    }

    const sql = this.assertReadOnly(input.sql);

    const connection = await this.pool.getConnection();
    try {
      // Thin mode honours callTimeout for the round trip; setting it is a no-op
      // if unsupported, so it's safe to set unconditionally.
      connection.callTimeout = QUERY_TIMEOUT_MS;

      const result = await connection.execute<Record<string, unknown>>(
        sql,
        input.binds ?? {},
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          maxRows: MAX_ROWS,
        },
      );

      const rows = result.rows ?? [];
      return {
        rowCount: rows.length,
        truncated: rows.length >= MAX_ROWS,
        rows,
      };
    } finally {
      // Always return the connection to the pool, even on error.
      await connection.close();
    }
  }

  /**
   * Reject anything that is not a single read-only SELECT/WITH statement. This
   * sits on top of (not instead of) using a read-only Oracle account: the model
   * is given a query tool, and we refuse DML/DDL/PL/SQL at the boundary.
   */
  private assertReadOnly(rawSql: string): string {
    // Strip a single trailing semicolon (common, harmless), then reject any
    // remaining one — embedded ';' implies multiple statements / injection.
    const sql = rawSql.trim().replace(/;\s*$/, '');
    if (sql.length === 0) {
      throw new Error('SQL query is empty.');
    }
    if (sql.includes(';')) {
      throw new Error('Only a single statement is allowed (remove extra ";").');
    }

    // Skip leading line/block comments so "/* note */ select ..." is still allowed.
    const body = sql
      .replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))+/, '')
      .trimStart();
    const firstKeyword = body.split(/\s+/, 1)[0]?.toUpperCase() ?? '';
    if (firstKeyword !== 'SELECT' && firstKeyword !== 'WITH') {
      throw new Error(
        'Only read-only SELECT / WITH queries are permitted by this tool.',
      );
    }
    return sql;
  }
}
