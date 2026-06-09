import { Injectable } from '@nestjs/common';

import {
  BusinessApiService,
  type BusinessApiResult,
} from '../business-api/business-api.service';
import type { BusinessToolContext } from '../business-api/business-tool-context';

const SOURCE = 'party-service';

export interface PartyByIdInput {
  partyId: string;
}

export interface RelatedPartiesInput extends PartyByIdInput {
  relationshipType?: string;
}

export interface BrokerScopedInput {
  brokerId?: string;
}

export interface AumSummaryInput extends BrokerScopedInput {
  partyId?: string;
}

export interface CommissionSummaryInput extends BrokerScopedInput {
  fromDate?: string;
  toDate?: string;
}

export interface SearchBrokerClientsInput extends BrokerScopedInput {
  query: string;
  page?: number;
  pageSize?: number;
}

export interface PolicyRelationshipsInput {
  policyId: string;
}

export interface OrganisationRelationshipsInput {
  organisationId: string;
}

export interface RelationshipPathInput {
  fromPartyId: string;
  toPartyId: string;
  relationshipTypes?: string[];
}

export interface RelationshipPathsInput {
  paths: RelationshipPathInput[];
}

@Injectable()
export class PartyService {
  constructor(private readonly api: BusinessApiService) {}

  getParty(
    context: BusinessToolContext,
    input: PartyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getParty', ['parties', input.partyId]);
  }

  getRelatedParties(
    context: BusinessToolContext,
    input: RelatedPartiesInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(
      context,
      SOURCE,
      'getRelatedParties',
      ['parties', input.partyId, 'related'],
      { relationshipType: input.relationshipType },
    );
  }

  getSubscriptions(
    context: BusinessToolContext,
    input: PartyByIdInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getSubscriptions', [
      'parties',
      input.partyId,
      'subscriptions',
    ]);
  }

  getBrokerDetails(
    context: BusinessToolContext,
    input: BrokerScopedInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getBrokerDetails', [
      'brokers',
      this.brokerSegment(context, input.brokerId),
      'details',
    ]);
  }

  getAumSummary(
    context: BusinessToolContext,
    input: AumSummaryInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(
      context,
      SOURCE,
      'getAumSummary',
      ['brokers', this.brokerSegment(context, input.brokerId), 'aum-summary'],
      { partyId: input.partyId },
    );
  }

  getCommissionSummary(
    context: BusinessToolContext,
    input: CommissionSummaryInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(
      context,
      SOURCE,
      'getCommissionSummary',
      ['brokers', this.brokerSegment(context, input.brokerId), 'commission-summary'],
      { fromDate: input.fromDate, toDate: input.toDate },
    );
  }

  searchBrokerClients(
    context: BusinessToolContext,
    input: SearchBrokerClientsInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(
      context,
      SOURCE,
      'searchBrokerClients',
      ['brokers', this.brokerSegment(context, input.brokerId), 'clients', 'search'],
      {
        query: input.query,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
    );
  }

  getCreditControlClientCount(
    context: BusinessToolContext,
    input: BrokerScopedInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getCreditControlClientCount', [
      'brokers',
      this.brokerSegment(context, input.brokerId),
      'credit-control-client-count',
    ]);
  }

  getPolicyRelationships(
    context: BusinessToolContext,
    input: PolicyRelationshipsInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getPolicyRelationships', [
      'policies',
      input.policyId,
      'relationships',
    ]);
  }

  getOrganisationRelationships(
    context: BusinessToolContext,
    input: OrganisationRelationshipsInput,
  ): Promise<BusinessApiResult> {
    return this.api.get(context, SOURCE, 'getOrganisationRelationships', [
      'organisations',
      input.organisationId,
      'relationships',
    ]);
  }

  validateRelationshipPath(
    context: BusinessToolContext,
    input: RelationshipPathInput,
  ): Promise<BusinessApiResult> {
    return this.api.post(context, SOURCE, 'validateRelationshipPath', [
      'relationships',
      'validate-path',
    ], input);
  }

  validateRelationshipPaths(
    context: BusinessToolContext,
    input: RelationshipPathsInput,
  ): Promise<BusinessApiResult> {
    return this.api.post(context, SOURCE, 'validateRelationshipPaths', [
      'relationships',
      'validate-paths',
    ], input);
  }

  private brokerSegment(context: BusinessToolContext, brokerId: string | undefined): string {
    return brokerId ?? context.brokerId ?? 'me';
  }
}
