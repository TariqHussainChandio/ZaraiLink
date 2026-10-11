import { apiFetch } from '../../services/api/client';
import type { Profile } from '../../common/types/profile';
import type { Role } from '../../common/constants/roles';
import type { ReportStatus, ReportWithReporter } from '../types/reports';
import type { OrderWithItems } from '../../common/orders';
import { fetchPaymentByOrderId } from '../../common/payments';
import type { ApplicationDocument, BusinessType, RequiredDocument } from '../../common/auth';
import type { ApplicationDecision } from '../../expert';
import type { AdminQueues, OrderWithItems as AdminOrder } from '../../services/api/generated/types.gen';
import type { AiActivity, DiseaseKnowledgeEntry, DiseaseKnowledgeUpdate } from '../types/ai';
import type { AuditEventNameEntry, AuditLogEntryWithActor } from '../types/audit';
import type {
  ConsultationDetail,
  ConsultationStatus,
  ConsultationWithRelations,
  ModerateConsultationRequest,
} from '../types/consultations';
import type { OrderStatusHistoryEntry } from '../types/orders';
import type { Review, ReviewWithBuyer } from '../types/reviews';

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

/** The user list, filtered on the server (a pending-dealer queue filtered in the app lost everyone past one page). */
export async function fetchAllProfiles(filter: { role?: Role; accountStatus?: Profile['account_status'] } = {}): Promise<Profile[]> {
  return apiFetch('/api/v1/admin/users', { query: { role: filter.role, account_status: filter.accountStatus } });
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
  /** One SRDS §51 event name, from fetchAuditEvents. */
  action?: string;
}

export async function fetchAuditLogs({ targetEntity, actorId, action }: FetchAuditLogsParams = {}): Promise<
  AuditLogEntryWithActor[]
> {
  return apiFetch('/api/v1/admin/audit-logs', { query: { target_entity: targetEntity, actor_id: actorId, action } });
}

/** The SRDS §51 event names with the label the audit screen shows for each; the audit filter's options. */
export async function fetchAuditEvents(): Promise<AuditEventNameEntry[]> {
  return apiFetch('/api/v1/admin/audit-events');
}

/** What waits for the admin (SRDS §14): the counts behind the Overview's queue tiles. */
export async function fetchAdminQueues(): Promise<AdminQueues> {
  return apiFetch('/api/v1/admin/queues');
}

/** Platform-wide order overview — every order, not scoped to the caller. Admin-only. */
export async function fetchAllOrders(status?: 'disputed'): Promise<OrderWithItems[]> {
  return apiFetch(status ? `/api/v1/admin/orders?status=${status}` : '/api/v1/admin/orders');
}

export interface AdminOrderDetail {
  order: AdminOrder;
  history: OrderStatusHistoryEntry[];
  payment: Awaited<ReturnType<typeof fetchPaymentByOrderId>>;
}

/** One order as the admin reads it, with its status history and payment; the order routes let an admin read every order. */
export async function fetchOrderForAdmin(orderId: string): Promise<AdminOrderDetail> {
  const [order, history, payment] = await Promise.all([
    apiFetch<AdminOrder>(`/api/v1/orders/${orderId}`),
    apiFetch<OrderStatusHistoryEntry[]>(`/api/v1/orders/${orderId}/status-history`),
    fetchPaymentByOrderId(orderId),
  ]);
  return { order, history, payment };
}

/**
 * Cancels an order that has not left the seller (pending, confirmed, processing or ready; SRDS §14). Needs a second
 * factor; the reason is stored on the order for both parties to read and the API writes the audit entry (BR-15).
 */
export async function cancelOrderAsAdmin(orderId: string, reason: string): Promise<AdminOrder> {
  return apiFetch(`/api/v1/admin/orders/${orderId}/cancel`, { method: 'POST', body: { reason } });
}

// ---- consultations (SRDS §14). Moderation needs a second factor and is audited by the API (BR-15).

export async function fetchConsultationsForAdmin(
  filter: { status?: ConsultationStatus; olderThanDays?: number } = {},
): Promise<ConsultationWithRelations[]> {
  return apiFetch('/api/v1/admin/consultations', {
    query: { status: filter.status, older_than_days: filter.olderThanDays },
  });
}

export async function fetchConsultationForAdmin(consultationId: string): Promise<ConsultationDetail> {
  return apiFetch(`/api/v1/admin/consultations/${consultationId}`);
}

export async function moderateConsultation(consultationId: string, body: ModerateConsultationRequest): Promise<ConsultationDetail> {
  return apiFetch(`/api/v1/admin/consultations/${consultationId}/moderate`, { method: 'PATCH', body });
}

// ---- reviews (SRDS §14). An admin hides a review with a reason, or restores it; nothing is deleted. Both need a
// second factor and are audited by the API (BR-15).

export async function fetchReviewsForModeration(): Promise<ReviewWithBuyer[]> {
  return apiFetch('/api/v1/reviews/admin', { query: { include_hidden: true } });
}

export async function hideReview(reviewId: string, reason: string): Promise<Review> {
  return apiFetch(`/api/v1/reviews/${reviewId}/hide`, { method: 'PATCH', body: { reason } });
}

export async function restoreReview(reviewId: string): Promise<Review> {
  return apiFetch(`/api/v1/reviews/${reviewId}/restore`, { method: 'PATCH' });
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

// ---- AI module (A6; SRDS §37). Every write is audited by the API as "AI Configuration Changed" (BR-15, SRDS §51).

/** Scan, failure, low-confidence and referral counts for the recent window. Counts only: no image, no farmer. */
export async function fetchAiActivity(): Promise<AiActivity> {
  return apiFetch('/api/v1/admin/ai-activity');
}

export async function fetchDiseaseKnowledge(): Promise<DiseaseKnowledgeEntry[]> {
  return apiFetch('/api/v1/admin/disease-knowledge');
}

export async function fetchDiseaseKnowledgeEntry(classLabel: string): Promise<DiseaseKnowledgeEntry> {
  return apiFetch(`/api/v1/admin/disease-knowledge/${encodeURIComponent(classLabel)}`);
}

/** An edit; the server sends a reviewed entry back to pending review, so a changed text is never shown as reviewed. */
export async function updateDiseaseKnowledge(classLabel: string, changes: DiseaseKnowledgeUpdate): Promise<DiseaseKnowledgeEntry> {
  return apiFetch(`/api/v1/admin/disease-knowledge/${encodeURIComponent(classLabel)}`, { method: 'PATCH', body: changes });
}

/** Records that a qualified agronomist reviewed the entry; the server stamps who and when from the session. */
export async function reviewDiseaseKnowledge(classLabel: string): Promise<DiseaseKnowledgeEntry> {
  return apiFetch(`/api/v1/admin/disease-knowledge/${encodeURIComponent(classLabel)}/review`, { method: 'POST' });
}
