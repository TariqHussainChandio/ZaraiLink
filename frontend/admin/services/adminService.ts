import { apiFetch, apiFetchPage, type Page } from '../../services/api/client';
import type { ListingWithRelations } from '../../common/marketplace';
import type { Profile } from '../../common/types/profile';
import type { Role } from '../../common/constants/roles';
import type { ReportStatus, ReportWithReporter } from '../types/reports';
import type { AuditLogEntryWithActor } from '../types/audit';
import type { OrderWithItems } from '../../common/orders';
import type { ApplicationDocument, BusinessType, RequiredDocument } from '../../common/auth';
import type { ApplicationDecision } from '../../expert';

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

/** How many rows one request asks for; the API's own ceiling is 100. Every list pages past it with "Load more". */
export const ADMIN_PAGE_SIZE = 50;

/** One page of a list: the rows and where the next page starts (null on the last page). */
export type AdminPage<T> = Page<T[]>;

const pageQuery = (offset: number) => ({ limit: ADMIN_PAGE_SIZE, offset });

/** One page of users, filtered on the server by role and account status (a queue filtered in the app lost everyone past
 * the first page). The API has no name search, so the screen searches the pages it has loaded. */
export function fetchProfilesPage(
  filter: { role?: Role; accountStatus?: Profile['account_status'] },
  offset: number,
): Promise<AdminPage<Profile>> {
  return apiFetchPage('/api/v1/admin/users', {
    query: { role: filter.role, account_status: filter.accountStatus, ...pageQuery(offset) },
  });
}

// logAdminAction moved server-side entirely (backend/app/common/audit_log.py) — every
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

/**
 * Decides a submitted dealer application (A3a, A3b; SRDS §8, §12). Needs a second factor; the decision and its audit row
 * are one database transaction. A rejection's reason is what the dealer reads on their Application Status screen and
 * in the email sent after the decision; `email_delivered` says whether that email went out.
 */
export async function decideDealerApplication(
  profileId: string,
  status: 'approved' | 'rejected',
  reason?: string,
): Promise<ApplicationDecision> {
  return apiFetch(`/api/v1/admin/users/${profileId}/account-status`, {
    method: 'PATCH',
    body: { status, reason: reason?.trim() || null },
  });
}

export function fetchReportsPage(status: ReportStatus | undefined, offset: number): Promise<AdminPage<ReportWithReporter>> {
  return apiFetchPage('/api/v1/admin/reports', { query: { status, ...pageQuery(offset) } });
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

/** Newest first. The API filters by one `target_entity` or one actor, nothing else. */
export function fetchAuditLogsPage(
  { targetEntity, actorId }: FetchAuditLogsParams,
  offset: number,
): Promise<AdminPage<AuditLogEntryWithActor>> {
  return apiFetchPage('/api/v1/admin/audit-logs', {
    query: { target_entity: targetEntity, actor_id: actorId, ...pageQuery(offset) },
  });
}

/** Platform-wide order overview: every order, not scoped to the caller. Admin-only. */
export function fetchOrdersPage(offset: number): Promise<AdminPage<OrderWithItems>> {
  return apiFetchPage('/api/v1/admin/orders', { query: pageQuery(offset) });
}

/** Every listing for moderation, hidden and sold ones too. The route belongs to the marketplace API (admin-only there). */
export function fetchModerationListingsPage(offset: number): Promise<AdminPage<ListingWithRelations>> {
  return apiFetchPage('/api/v1/marketplace/listings/moderation', { query: pageQuery(offset) });
}

// ---- dealer applications (A3b; SRDS §12)

export interface DealerApplicationForAdmin {
  id: string;
  full_name: string;
  phone: string | null;
  account_status: 'pending' | 'approved' | 'rejected';
  account_status_reason: string | null;
  application_submitted_at: string | null;
  created_at: string;
  dealer_profile: {
    business_name: string;
    business_type: BusinessType;
    registration_number: string;
    business_address: string;
    country: string;
    province: string;
    city: string;
  } | null;
  dealer_documents: ApplicationDocument[];
}

/** The dealer queue: submitted applications in the order they came in (pending), or those decided either way. */
export async function fetchDealerApplications(
  status: DealerApplicationForAdmin['account_status'],
): Promise<DealerApplicationForAdmin[]> {
  return apiFetch('/api/v1/admin/dealer-applications', { query: { status } });
}

export async function fetchDealerApplication(dealerId: string): Promise<DealerApplicationForAdmin> {
  return apiFetch(`/api/v1/admin/dealer-applications/${dealerId}`);
}

/** A ten-minute link to one of the dealer's documents; the server finds the file from the document's own row. */
export async function resolveDealerDocumentUrl(dealerId: string, documentId: string): Promise<string> {
  const { url } = await apiFetch<{ url: string }>(`/api/v1/admin/dealer-applications/${dealerId}/documents/${documentId}/url`);
  return url;
}

// ---- required documents (A3b; SRDS §7: configurable). Every change is audited by the database (BR-15).

export interface RequiredDocumentInput {
  role: 'dealer' | 'expert';
  code: string;
  label: string;
  description: string | null;
  is_required: boolean;
  sort_order: number;
}

export async function fetchAllRequiredDocuments(): Promise<RequiredDocument[]> {
  return apiFetch('/api/v1/admin/required-documents');
}

export async function createRequiredDocument(input: RequiredDocumentInput): Promise<RequiredDocument> {
  return apiFetch('/api/v1/admin/required-documents', { method: 'POST', body: input });
}

export async function updateRequiredDocument(
  id: string,
  changes: Partial<Pick<RequiredDocument, 'label' | 'description' | 'is_required' | 'active' | 'sort_order'>>,
): Promise<RequiredDocument> {
  return apiFetch(`/api/v1/admin/required-documents/${id}`, { method: 'PATCH', body: changes });
}
