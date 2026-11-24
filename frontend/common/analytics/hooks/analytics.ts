// Analytics hooks: load each role's dashboard numbers with React Query.
import { useQuery } from '@tanstack/react-query';
import {
  fetchDealerAnalytics,
  fetchExpertAnalytics,
  fetchFarmerAnalytics,
} from '../services/analyticsService';
import { queryKeys } from '../../../hooks/keys';

/** The farmer dashboard's numbers. `enabled` is false for other roles: the endpoint is farmer-only (403 otherwise). */
export function useFarmerAnalytics(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.analytics.farmer(), queryFn: fetchFarmerAnalytics, enabled });
}

// The expert dashboard's numbers; enabled only for experts.
export function useExpertAnalytics(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.analytics.expert(), queryFn: fetchExpertAnalytics, enabled });
}

// The dealer dashboard's numbers; enabled only for dealers.
export function useDealerAnalytics(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.analytics.dealer(), queryFn: fetchDealerAnalytics, enabled });
}
