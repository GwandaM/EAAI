import { PartyService } from './party.service';
import type { BusinessApiService } from '../business-api/business-api.service';
import type { BusinessToolContext } from '../business-api/business-tool-context';

const context: BusinessToolContext = { userId: 'user-1', brokerId: 'broker-1' };

describe('PartyService', () => {
  it('uses the authenticated broker context when brokerId is omitted', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({ source: 'party-service' }),
    } as unknown as BusinessApiService;
    const service = new PartyService(api);

    await service.getBrokerDetails(context, {});

    expect(api.get).toHaveBeenCalledWith(context, 'party-service', 'getBrokerDetails', [
      'brokers',
      'broker-1',
      'details',
    ]);
  });

  it('maps relationship validation to a POST endpoint', async () => {
    const api = {
      post: jest.fn().mockResolvedValue({ source: 'party-service' }),
    } as unknown as BusinessApiService;
    const service = new PartyService(api);
    const input = { fromPartyId: 'A', toPartyId: 'B' };

    await service.validateRelationshipPath(context, input);

    expect(api.post).toHaveBeenCalledWith(
      context,
      'party-service',
      'validateRelationshipPath',
      ['relationships', 'validate-path'],
      input,
    );
  });
});
