import { Injectable } from '@nestjs/common';

import {
  BusinessApiService,
  type BusinessApiResult,
} from '../business-api/business-api.service';
import type { BusinessToolContext } from '../business-api/business-tool-context';

const SOURCE = 'policy-service';

export interface PolicyByIdInput {
  policyId: string;
}

export interface PolicyWithdrawalsInput extends PolicyByIdInput {
  fromDate?: string;
  toDate?: string;
}

export interface PolicyPartyInput {
  policyId?: string;
  partyId?: string;
}

export interface SearchPoliciesInput {
  query: string;
  partyId?: string;
  status?: string;
}

export interface PagedSearchPoliciesInput {
  query?: string;
  partyId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class PolicyService {
  constructor(private readonly api: BusinessApiService) {}

  getPolicy(
    context: BusinessToolContext,
    input: PolicyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getPolicy', ['policies', input.policyId]);
  }

  getPolicyPerformanceValues(
    context: BusinessToolContext,
    input: PolicyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getPolicyPerformanceValues', [
      'policies',
      input.policyId,
      'performance-values',
    ]);
  }

  getPolicyValues(
    context: BusinessToolContext,
    input: PolicyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getPolicyValues', [
      'policies',
      input.policyId,
      'values',
    ]);
  }

  getIrrDetails(
    context: BusinessToolContext,
    input: PolicyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getIrrDetails', [
      'policies',
      input.policyId,
      'irr-details',
    ]);
  }

  getMoneyCategories(
    context: BusinessToolContext,
    input: PolicyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getMoneyCategories', [
      'policies',
      input.policyId,
      'money-categories',
    ]);
  }

  getWithdrawals(
    context: BusinessToolContext,
    input: PolicyWithdrawalsInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(
      context,
      SOURCE,
      'getWithdrawals',
      ['policies', input.policyId, 'withdrawals'],
      { fromDate: input.fromDate, toDate: input.toDate },
    );
  }

  getBenefits(
    context: BusinessToolContext,
    input: PolicyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getBenefits', [
      'policies',
      input.policyId,
      'benefits',
    ]);
  }

  getSpecialOffers(
    context: BusinessToolContext,
    input: PolicyPartyInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getSpecialOffers', ['policies', 'special-offers'], {
      policyId: input.policyId,
      partyId: input.partyId,
    });
  }

  getOutstandingBills(
    context: BusinessToolContext,
    input: PolicyPartyInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(
      context,
      SOURCE,
      'getOutstandingBills',
      ['policies', 'outstanding-bills'],
      { policyId: input.policyId, partyId: input.partyId },
    );
  }

  searchPolicies(
    context: BusinessToolContext,
    input: SearchPoliciesInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'searchPolicies', ['policies', 'search'], {
      query: input.query,
      partyId: input.partyId,
      status: input.status,
    });
  }

  pagedSearchPolicies(
    context: BusinessToolContext,
    input: PagedSearchPoliciesInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'pagedSearchPolicies', ['policies', 'paged-search'], {
      query: input.query,
      partyId: input.partyId,
      status: input.status,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 25,
    });
  }

  getPolicySubscriptions(
    context: BusinessToolContext,
    input: PolicyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getPolicySubscriptions', [
      'policies',
      input.policyId,
      'subscriptions',
    ]);
  }
}
