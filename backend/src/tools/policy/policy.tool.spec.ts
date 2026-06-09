import { buildPolicyTools } from './policy.tool';
import type { PolicyService } from './policy.service';
import type { BusinessToolContext } from '../business-api/business-tool-context';

const noopOptions = { toolCallId: 'tc-1', messages: [] } as never;
const context: BusinessToolContext = { userId: 'user-1', brokerId: 'broker-1' };

describe('buildPolicyTools', () => {
  it('exposes the policy service functions from the architecture', () => {
    const tools = buildPolicyTools({} as PolicyService, context);

    expect(Object.keys(tools).sort()).toEqual([
      'getBenefits',
      'getIrrDetails',
      'getMoneyCategories',
      'getOutstandingBills',
      'getPolicy',
      'getPolicyPerformanceValues',
      'getPolicySubscriptions',
      'getPolicyValues',
      'getSpecialOffers',
      'getWithdrawals',
      'pagedSearchPolicies',
      'searchPolicies',
    ]);
  });

  it('calls the service with server-side context, not model-supplied context', async () => {
    const service = {
      getPolicy: jest.fn().mockResolvedValue({
        source: 'policy-service',
        operation: 'getPolicy',
        data: { policyId: 'POL-1' },
      }),
    } as unknown as PolicyService;

    const tools = buildPolicyTools(service, context);
    const out = await tools.getPolicy.execute!({ policyId: 'POL-1' }, noopOptions);

    expect(service.getPolicy).toHaveBeenCalledWith(context, { policyId: 'POL-1' });
    expect(out).toEqual({
      ok: true,
      data: {
        source: 'policy-service',
        operation: 'getPolicy',
        data: { policyId: 'POL-1' },
      },
    });
  });

  it('returns ok:false when the policy service fails', async () => {
    const service = {
      searchPolicies: jest.fn().mockRejectedValue(new Error('forbidden')),
    } as unknown as PolicyService;

    const tools = buildPolicyTools(service, context);
    const out = await tools.searchPolicies.execute!({ query: 'smith' }, noopOptions);

    expect(out).toEqual({ ok: false, error: 'forbidden' });
  });
});
