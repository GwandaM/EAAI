import { buildPartyTools } from './party.tool';
import type { PartyService } from './party.service';
import type { BusinessToolContext } from '../business-api/business-tool-context';

const noopOptions = { toolCallId: 'tc-1', messages: [] } as never;
const context: BusinessToolContext = { userId: 'user-1', brokerId: 'broker-1' };

describe('buildPartyTools', () => {
  it('exposes the party service functions from the architecture', () => {
    const tools = buildPartyTools({} as PartyService, context);

    expect(Object.keys(tools).sort()).toEqual([
      'getAumSummary',
      'getBrokerDetails',
      'getCommissionSummary',
      'getCreditControlClientCount',
      'getOrganisationRelationships',
      'getParty',
      'getPolicyRelationships',
      'getRelatedParties',
      'getSubscriptions',
      'searchBrokerClients',
      'validateRelationshipPath',
      'validateRelationshipPaths',
    ]);
  });

  it('calls relationship validation with server-side context', async () => {
    const service = {
      validateRelationshipPath: jest.fn().mockResolvedValue({
        source: 'party-service',
        operation: 'validateRelationshipPath',
        data: { valid: true },
      }),
    } as unknown as PartyService;

    const tools = buildPartyTools(service, context);
    const input = { fromPartyId: 'A', toPartyId: 'B' };
    const out = await tools.validateRelationshipPath.execute!(input, noopOptions);

    expect(service.validateRelationshipPath).toHaveBeenCalledWith(context, input);
    expect(out).toEqual({
      ok: true,
      data: {
        source: 'party-service',
        operation: 'validateRelationshipPath',
        data: { valid: true },
      },
    });
  });

  it('returns ok:false when the party service fails', async () => {
    const service = {
      searchBrokerClients: jest.fn().mockRejectedValue(new Error('forbidden')),
    } as unknown as PartyService;

    const tools = buildPartyTools(service, context);
    // page/pageSize are schema defaults; the SDK applies them before execute.
    const out = await tools.searchBrokerClients.execute!(
      { query: 'smith', page: 1, pageSize: 25 },
      noopOptions,
    );

    expect(out).toEqual({ ok: false, error: 'forbidden' });
  });
});
