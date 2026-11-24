// Analytics API calls: fetch each role's dashboard numbers.
import { apiFetch } from '../../../services/api/client';
import type {
  AdminAnalytics,
  DealerAnalytics,
  ExpertAnalytics,
  FarmerAnalytics,
} from '../types/analytics';

/**
 * All aggregation (product-stat accumulation, month-bucketing, completed-orders-only sales
 * filtering, etc.) moved server-side (`backend/app/common/analytics/service.py`), reusing
 * the other domains' repository functions in-process rather than duplicating their queries —
 * this file is now a thin wrapper. No id params — every endpoint scopes to the caller's own
 * data via their role (`require_farmer`/`require_dealer`/`require_expert`/`require_admin`).
 */
export async function fetchFarmerAnalytics(): Promise<FarmerAnalytics> {
  return apiFetch('/api/v1/analytics/farmer');
}

// Fetches the dealer dashboard numbers.
export async function fetchDealerAnalytics(): Promise<DealerAnalytics> {
  return apiFetch('/api/v1/analytics/dealer');
}

// Fetches the expert dashboard numbers.
export async function fetchExpertAnalytics(): Promise<ExpertAnalytics> {
  return apiFetch('/api/v1/analytics/expert');
}

// Fetches the admin dashboard numbers.
export async function fetchAdminAnalytics(): Promise<AdminAnalytics> {
  return apiFetch('/api/v1/analytics/admin');
}
