import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../../config/configuration';
import type { BusinessToolContext } from './business-tool-context';

export type BusinessServiceSource = 'policy-service' | 'party-service';

export interface BusinessApiResult<T = unknown> {
  source: BusinessServiceSource;
  operation: string;
  data: T;
}

type QueryValue = string | number | boolean | null | undefined;
type QueryParams = Record<string, QueryValue>;

@Injectable()
export class BusinessApiService {
  private readonly baseUrl: string;
  private readonly token: string | undefined;
  private static readonly TIMEOUT_MS = 10_000;

  constructor(config: ConfigService<AppConfig, true>) {
    const api = config.get('companyApi', { infer: true });
    this.baseUrl = api.baseUrl;
    this.token = api.token;
  }

  async get<T = unknown>(
    context: BusinessToolContext,
    source: BusinessServiceSource,
    operation: string,
    pathSegments: string[],
    query?: QueryParams,
  ): Promise<BusinessApiResult<T>> {
    const data = await this.request<T>(context, 'GET', pathSegments, query);
    return { source, operation, data };
  }

  async post<T = unknown>(
    context: BusinessToolContext,
    source: BusinessServiceSource,
    operation: string,
    pathSegments: string[],
    body: unknown,
  ): Promise<BusinessApiResult<T>> {
    const data = await this.request<T>(context, 'POST', pathSegments, undefined, body);
    return { source, operation, data };
  }

  private async request<T>(
    context: BusinessToolContext,
    method: 'GET' | 'POST',
    pathSegments: string[],
    query?: QueryParams,
    body?: unknown,
  ): Promise<T> {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    const path = pathSegments.map((segment) => encodeURIComponent(segment)).join('/');
    const url = new URL(path, base);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const response = await fetch(url, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        'X-Authenticated-User-Id': context.userId,
        ...(context.email ? { 'X-Authenticated-User-Email': context.email } : {}),
        ...(context.brokerId ? { 'X-Broker-Id': context.brokerId } : {}),
        ...(context.partyId ? { 'X-Party-Id': context.partyId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(BusinessApiService.TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Business API returned ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}
