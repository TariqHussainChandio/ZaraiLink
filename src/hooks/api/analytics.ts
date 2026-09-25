import { useQuery } from '@tanstack/react-query';
import {
  fetchDealerAnalytics,
  fetchExpertAnalytics,
  fetchFarmerAnalytics,
} from '../../services/modules/analytics/analyticsService';
import { queryKeys } from './keys';

/** The farmer dashboard's numbers. `enabled` is false for other roles: the endpoint is farmer-only (403 otherwise). */
export function useFarmerAnalytics(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.analytics.farmer(), queryFn: fetchFarmerAnalytics, enabled });
}

export function useExpertAnalytics(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.analytics.expert(), queryFn: fetchExpertAnalytics, enabled });
}

export function useDealerAnalytics(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.analytics.dealer(), queryFn: fetchDealerAnalytics, enabled });
}
