import { PolicyService } from './policy.service';
import type { BusinessApiService } from '../business-api/business-api.service';
import type { BusinessToolContext } from '../business-api/business-tool-context';

const context: BusinessToolContext = { userId: 'user-1', brokerId: 'broker-1' };

describe('PolicyService', () => {
  it('maps getPolicy to the policy service endpoint', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({ source: 'policy-service' }),
    } as unknown as BusinessApiService;
    const service = new PolicyService(api);

    await service.getPolicy(context, { policyId: 'POL-1' });

    expect(api.get).toHaveBeenCalledWith(context, 'policy-service', 'getPolicy', [
      'policies',
      'POL-1',
    ]);
  });

  it('maps pagedSearchPolicies with default paging', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({ source: 'policy-service' }),
    } as unknown as BusinessApiService;
    const service = new PolicyService(api);

    await service.pagedSearchPolicies(context, { query: 'smith' });

    expect(api.get).toHaveBeenCalledWith(
      context,
      'policy-service',
      'pagedSearchPolicies',
      ['policies', 'paged-search'],
      {
        query: 'smith',
        partyId: undefined,
        status: undefined,
        page: 1,
        pageSize: 25,
      },
    );
  });
});
