import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import pg from 'pg';

import type { AppConfig } from '../../config/configuration';

export type SalesMetric = 'sales' | 'revenue' | 'margin' | 'units_sold';

export interface SalesQueryInput {
  metric: SalesMetric;
  startDate: string;
  endDate: string;
  productId?: string;
  region?: string;
}

export interface SalesRow {
  record_date: string;
  product_id: string;
  region: string;
  metric_value: number;
}

export interface SalesQueryOutput {
  source: 'postgres' | 'mock';
  rows: SalesRow[];
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool | undefined;

  constructor(config: ConfigService<AppConfig, true>) {
    const url = config.get('database', { infer: true }).url;

    if (url) {
      this.pool = new pg.Pool({
        connectionString: url,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
      });
      this.logger.log('PostgreSQL pool initialized.');
    } else {
      this.logger.warn('DATABASE_URL not set — sales tool will return mock data.');
    }
  }

  async querySales(input: SalesQueryInput): Promise<SalesQueryOutput> {
    if (!this.pool) {
      return { source: 'mock', rows: this.buildMockRows(input) };
    }

    const values: unknown[] = [input.startDate, input.endDate];
    const where = ['record_date >= $1', 'record_date <= $2'];

    if (input.productId) {
      values.push(input.productId);
      where.push(`product_id = $${values.length}`);
    }
    if (input.region) {
      values.push(input.region);
      where.push(`region = $${values.length}`);
    }

    // metric is constrained to a fixed enum at the tool boundary, so injecting it
    // into the projection list is safe — but we still validate it here as defence-in-depth.
    const allowedMetrics: SalesMetric[] = ['sales', 'revenue', 'margin', 'units_sold'];
    if (!allowedMetrics.includes(input.metric)) {
      throw new Error(`Unsupported metric: ${input.metric}`);
    }

    const sql = `
      select
        record_date,
        product_id,
        region,
        ${input.metric} as metric_value
      from sales_performance
      where ${where.join(' and ')}
      order by record_date desc
      limit 100
    `;

    try {
      const result = await this.pool.query<SalesRow>(sql, values);
      return { source: 'postgres', rows: result.rows };
    } catch (error) {
      // If the table is missing (fresh DB without seeding), fall back to mock so
      // the agent can still demonstrate end-to-end behaviour. Re-throw anything else.
      const code = (error as { code?: string } | null)?.code;
      if (code === '42P01') {
        this.logger.warn('sales_performance table missing — falling back to mock rows.');
        return { source: 'mock', rows: this.buildMockRows(input) };
      }
      throw error;
    }
  }

  private buildMockRows(input: SalesQueryInput): SalesRow[] {
    const regions = input.region ? [input.region] : ['EMEA', 'NA', 'APAC'];
    const productId = input.productId ?? 'SKU-001';
    return regions.map((region, idx) => ({
      record_date: input.endDate,
      product_id: productId,
      region,
      metric_value: Math.round(1000 + idx * 137 + Math.random() * 250),
    }));
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL pool closed.');
    }
  }
}
