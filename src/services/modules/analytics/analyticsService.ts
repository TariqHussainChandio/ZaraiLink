import { apiFetch } from '../../api/client';
import type {
  AdminAnalytics,
  DealerAnalytics,
  ExpertAnalytics,
  FarmerAnalytics,
} from '../../../types/analytics';

/**
 * All aggregation (product-stat accumulation, month-bucketing, completed-orders-only sales
 * filtering, etc.) moved server-side (`backend/app/services/analytics_service.py`), reusing
 * the other domains' repository functions in-process rather than duplicating their queries —
 * this file is now a thin wrapper. No id params — every endpoint scopes to the caller's own
 * data via their role (`require_farmer`/`require_dealer`/`require_expert`/`require_admin`).
 */
export async function fetchFarmerAnalytics(): Promise<FarmerAnalytics> {
  return apiFetch('/api/v1/analytics/farmer');
}

export async function fetchDealerAnalytics(): Promise<DealerAnalytics> {
  return apiFetch('/api/v1/analytics/dealer');
}

export async function fetchExpertAnalytics(): Promise<ExpertAnalytics> {
  return apiFetch('/api/v1/analytics/expert');
}

export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  return apiFetch('/api/v1/analytics/admin');
}
