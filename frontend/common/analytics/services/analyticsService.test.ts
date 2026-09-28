import { apiFetch } from '../../../services/api/client';
import {
  fetchAdminAnalytics,
  fetchDealerAnalytics,
  fetchExpertAnalytics,
  fetchFarmerAnalytics,
} from './analyticsService';

jest.mock('../../../services/api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
  mockApiFetch.mockResolvedValue({} as never);
});

describe('analyticsService', () => {
  it('fetchFarmerAnalytics calls the farmer analytics endpoint', async () => {
    await fetchFarmerAnalytics();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/analytics/farmer');
  });

  it('fetchDealerAnalytics calls the dealer analytics endpoint', async () => {
    await fetchDealerAnalytics();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/analytics/dealer');
  });

  it('fetchExpertAnalytics calls the expert analytics endpoint', async () => {
    await fetchExpertAnalytics();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/analytics/expert');
  });

  it('fetchAdminAnalytics calls the admin analytics endpoint', async () => {
    await fetchAdminAnalytics();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/analytics/admin');
  });
});
