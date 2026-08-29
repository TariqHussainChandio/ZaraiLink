import { apiFetch } from '../../api/client';
import type { Profile } from '../../../types/profile';
import type { Role } from '../../../constants/roles';
import type { ReportStatus, ReportWithReporter } from '../../../types/reports';
import type { AuditLogEntryWithActor } from '../../../types/audit';
import type { OrderWithItems } from '../../../types/orders';

export interface PlatformStats {
  totalUsers: number;
  usersByRole: Record<string, number>;
  totalListings: number;
  totalOrders: number;
}

interface ApiPlatformStats {
  total_users: number;
  users_by_role: Record<string, number>;
  total_listings: number;
  total_orders: number;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const data = await apiFetch<ApiPlatformStats>('/api/v1/admin/stats');
  return {
    totalUsers: data.total_users,
    usersByRole: data.users_by_role,
    totalListings: data.total_listings,
    totalOrders: data.total_orders,
  };
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  return apiFetch('/api/v1/admin/users');
}

// logAdminAction moved server-side entirely (backend/app/services/audit_log_service.py) — every
// mutation below writes its own audit_logs row as part of the same backend request, so there's
// no separate client-side call left to make.

/** No `actorId` param — the acting admin is derived from the verified session token. */
export async function setProfileSuspended(id: string, isSuspended: boolean): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${id}/suspend`, { method: 'PATCH', body: { is_suspended: isSuspended } });
}

/** Takes only the profile id — the backend reads the real current role itself (for the audit
 * log's "previous state") rather than trusting whatever a possibly-stale client object claims. */
export async function updateUserRole(profileId: string, newRole: Role): Promise<void> {
  await apiFetch(`/api/v1/admin/users/${profileId}/role`, { method: 'PATCH', body: { role: newRole } });
}

export async function fetchReports(status?: ReportStatus): Promise<ReportWithReporter[]> {
  return apiFetch('/api/v1/admin/reports', { query: { status } });
}

export async function resolveReport(reportId: string, notes: string | null): Promise<void> {
  await apiFetch(`/api/v1/admin/reports/${reportId}/resolve`, { method: 'PATCH', body: { notes } });
}

export async function dismissReport(reportId: string, notes: string | null): Promise<void> {
  await apiFetch(`/api/v1/admin/reports/${reportId}/dismiss`, { method: 'PATCH', body: { notes } });
}

export interface FetchAuditLogsParams {
  targetEntity?: string;
  actorId?: string;
}

export async function fetchAuditLogs({ targetEntity, actorId }: FetchAuditLogsParams = {}): Promise<
  AuditLogEntryWithActor[]
> {
  return apiFetch('/api/v1/admin/audit-logs', { query: { target_entity: targetEntity, actor_id: actorId } });
}

/** Platform-wide order overview — every order, not scoped to the caller. Admin-only. */
export async function fetchAllOrders(): Promise<OrderWithItems[]> {
  return apiFetch('/api/v1/admin/orders');
}
