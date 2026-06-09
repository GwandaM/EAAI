import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration';

export interface CompanyProduct {
  product: unknown;
}

@Injectable()
export class CompanyApiService {
  private readonly logger = new Logger(CompanyApiService.name);
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private static readonly TIMEOUT_MS = 10_000;

  constructor(config: ConfigService<AppConfig, true>) {
    const api = config.get('companyApi', { infer: true });
    this.baseUrl = api.baseUrl;
    this.token = api.token;
  }

  async getProduct(productId: string): Promise<CompanyProduct> {
    // Resolve against a base that ends in "/" using a *relative* segment, so any
    // path prefix on baseUrl (e.g. https://api.company.com/v1) is preserved. A
    // leading-slash path would be treated as root-relative and drop the prefix.
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const url = new URL(`products/${encodeURIComponent(productId)}`, base);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      signal: AbortSignal.timeout(CompanyApiService.TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Company API returned ${response.status} ${response.statusText}`);
    }

    return { product: await response.json() };
  }
}
