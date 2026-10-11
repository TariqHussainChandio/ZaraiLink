import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRequiredDocument,
  decideDealerApplication,
  dismissReport,
  fetchAllRequiredDocuments,
  fetchDealerApplication,
  fetchDealerApplications,
  resolveDealerDocumentUrl,
  updateRequiredDocument,
  type DealerApplicationForAdmin,
  type RequiredDocumentInput,
  fetchAllOrders,
  fetchAllProfiles,
  fetchAuditLogs,
  fetchPlatformStats,
  fetchReports,
  resolveReport,
  setProfileSuspended,
  updateUserRole,
  fetchAiActivity,
  fetchDiseaseKnowledge,
  fetchDiseaseKnowledgeEntry,
  reviewDiseaseKnowledge,
  updateDiseaseKnowledge,
  cancelOrderAsAdmin,
  fetchAdminQueues,
  fetchAuditEvents,
  fetchConsultationForAdmin,
  fetchConsultationsForAdmin,
  fetchOrderForAdmin,
  fetchReviewsForModeration,
  hideReview,
  moderateConsultation,
  restoreReview,
} from '../services/adminService';
import type { DiseaseKnowledgeEntry, DiseaseKnowledgeUpdate } from '../types/ai';
import type { ConsultationStatus } from '../types/consultations';
import { fetchAdminAnalytics } from '../../common/analytics';
import {
  fetchExpertById,
  fetchExpertForAdminById,
  fetchExpertsForAdmin,
  resolveExpertDocumentUrl,
  reviewExpertVerification,
  type VerificationStatus,
} from '../../expert';
import {
  createCategory,
  deleteCategory,
  fetchAllListingsForModeration,
  fetchListingById,
  updateCategory,
  updateListingStatus,
  type CategoryInput,
  type ListingStatus,
} from '../../common/marketplace';
import { fetchMessageById, redactMessage } from '../../common/messaging';
import { fetchReviewById } from '../../common/reviews';
import type { Role } from '../../common/constants/roles';
import type { ReportStatus, ReportWithReporter } from '../types/reports';
import { queryKeys } from '../../hooks/keys';

/*
 * Every admin write below is audit-logged by the API (BR-15); the hooks only decide what refetches afterwards. The
 * admin data is never written to the on-disk cache (queryClient.ts persists public marketplace reads only).
 */

// The A7 moderation keys sit under queryKeys.admin.all, so a sign-out or an admin-wide refresh clears them too.
const moderationKeys = {
  queues: () => [...queryKeys.admin.all, 'queues'] as const,
  auditEvents: () => [...queryKeys.admin.all, 'audit-events'] as const,
  order: (orderId: string) => [...queryKeys.admin.all, 'order', orderId] as const,
  consultations: (status: ConsultationStatus | undefined, olderThanDays: number | undefined) =>
    [...queryKeys.admin.all, 'consultations', status ?? 'all', olderThanDays ?? null] as const,
  consultation: (id: string) => [...queryKeys.admin.all, 'consultation', id] as const,
  reviews: () => [...queryKeys.admin.all, 'reviews'] as const,
};

export function useAdminAnalytics() {
  return useQuery({ queryKey: queryKeys.admin.analytics(), queryFn: fetchAdminAnalytics });
}

export function usePlatformStats() {
  return useQuery({ queryKey: queryKeys.admin.stats(), queryFn: fetchPlatformStats });
}

/** The audit log, filtered on the server by one SRDS §51 event name when `action` is given. */
export function useAuditLogs(action?: string) {
  return useQuery({
    queryKey: [...queryKeys.admin.auditLogs(), action ?? 'all'],
    queryFn: () => fetchAuditLogs({ action }),
    staleTime: 0,
  });
}

/** The §51 event names and labels; reference data, so it is kept for the session. */
export function useAuditEvents() {
  return useQuery({ queryKey: moderationKeys.auditEvents(), queryFn: fetchAuditEvents, staleTime: Infinity });
}

/** The Overview's queue counts (SRDS §14). */
export function useAdminQueues() {
  return useQuery({ queryKey: moderationKeys.queues(), queryFn: fetchAdminQueues, staleTime: 0 });
}

export function useAllOrders(status?: 'disputed') {
  return useQuery({
    queryKey: [...queryKeys.admin.orders(), status ?? 'all'],
    queryFn: () => fetchAllOrders(status),
    staleTime: 0,
  });
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
}

// ---- users

/** Every user. Dealer applications are decided from Approvals, after reading them (A3b). */
export function useProfiles() {
  return useQuery({ queryKey: queryKeys.admin.profiles(), queryFn: () => fetchAllProfiles(), staleTime: 0 });
}

export function useSetProfileSuspended() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, suspended }: { id: string; suspended: boolean }) => setProfileSuspended(id, suspended),
    onSuccess: invalidate,
  });
}

export function useDecideDealerApplication() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: string; status: 'approved' | 'rejected'; reason?: string }) =>
      decideDealerApplication(id, status, reason),
    onSuccess: invalidate,
  });
}

export function useUpdateUserRole() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => updateUserRole(id, role),
    onSuccess: invalidate,
  });
}

// ---- listings

export function useModerationListings() {
  return useQuery({
    queryKey: queryKeys.admin.moderationListings(),
    queryFn: fetchAllListingsForModeration,
    staleTime: 0,
  });
}

/** A moderation change to a listing shows in the marketplace as well as in the admin list. */
export function useSetListingStatus() {
  const invalidateAdmin = useInvalidateAdmin();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ListingStatus }) => updateListingStatus(id, status),
    onSuccess: () =>
      Promise.all([invalidateAdmin(), queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.all })]),
  });
}

// ---- categories (reads use `useCategories` in marketplace.ts)

function useInvalidateCategories() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.marketplace.categories() });
}

export function useSaveCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CategoryInput }) =>
      id ? updateCategory(id, input) : createCategory(input),
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidateCategories();
  return useMutation({ mutationFn: (id: string) => deleteCategory(id), onSuccess: invalidate });
}

// ---- expert verification

export function useExpertVerifications(status: VerificationStatus | undefined) {
  return useQuery({
    queryKey: queryKeys.admin.verifications(status),
    queryFn: () => fetchExpertsForAdmin(status),
    staleTime: 0,
  });
}

export function useReviewVerification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expertId,
      decision,
      notes,
    }: {
      expertId: string;
      decision: 'approved' | 'rejected';
      notes: string;
    }) => reviewExpertVerification(expertId, decision, notes),
    // A decision changes who shows up as a verified expert, not only the admin list.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.experts.all }),
      ]),
  });
}

export function useExpertApplication(expertId: string) {
  return useQuery({
    queryKey: queryKeys.admin.expertApplication(expertId),
    queryFn: () => fetchExpertForAdminById(expertId),
    // The detail screen asks for one role's application; the other query stays idle.
    enabled: !!expertId,
    staleTime: 0,
  });
}

// ---- dealer applications (A3b)

export function useDealerApplications(status: DealerApplicationForAdmin['account_status']) {
  return useQuery({
    queryKey: queryKeys.admin.dealerApplications(status),
    queryFn: () => fetchDealerApplications(status),
    staleTime: 0,
  });
}

export function useDealerApplication(dealerId: string) {
  return useQuery({
    queryKey: queryKeys.admin.dealerApplication(dealerId),
    queryFn: () => fetchDealerApplication(dealerId),
    // The detail screen asks for one role's application; the other query stays idle.
    enabled: !!dealerId,
    staleTime: 0,
  });
}

/**
 * A ten-minute signed link to one application document, asked for when the admin opens it and never kept in the cache.
 * The server looks the file up from the document's own row under that applicant.
 */
export function useApplicationDocumentUrl() {
  return useMutation({
    mutationFn: ({ role, applicantId, documentId }: { role: 'dealer' | 'expert'; applicantId: string; documentId: string }) =>
      role === 'dealer' ? resolveDealerDocumentUrl(applicantId, documentId) : resolveExpertDocumentUrl(applicantId, documentId),
  });
}

// ---- required documents (A3b)

export function useAllRequiredDocuments() {
  return useQuery({ queryKey: queryKeys.admin.requiredDocuments(), queryFn: fetchAllRequiredDocuments, staleTime: 0 });
}

export function useSaveRequiredDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, changes }: { id?: string; input?: RequiredDocumentInput; changes?: Parameters<typeof updateRequiredDocument>[1] }) =>
      id ? updateRequiredDocument(id, changes ?? {}) : createRequiredDocument(input as RequiredDocumentInput),
    // Applicants read the list too, so their copy refreshes with the admin's.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.requiredDocuments() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.application.requiredDocuments() }),
      ]),
  });
}

// ---- reports

export function useReports(status: ReportStatus | undefined) {
  return useQuery({ queryKey: queryKeys.admin.reports(status), queryFn: () => fetchReports(status), staleTime: 0 });
}

/**
 * Best-effort one-line preview of what a report is about, fetched per report's target type. A preview that cannot be
 * loaded (the content was deleted, or is not visible) shows a placeholder instead of failing the list.
 */
async function fetchPreview(report: ReportWithReporter): Promise<string> {
  try {
    switch (report.target_type) {
      case 'listing':
      case 'product':
        return (await fetchListingById(report.target_id)).title;
      case 'review':
        return (await fetchReviewById(report.target_id)).comment ?? '(no comment)';
      case 'message':
        return (await fetchMessageById(report.target_id)).body;
      case 'expert':
        return (await fetchExpertById(report.target_id)).profile?.full_name || 'Unknown expert';
      case 'user': {
        const profiles = await fetchAllProfiles();
        return profiles.find(p => p.id === report.target_id)?.full_name || 'Unknown user';
      }
      default:
        return report.target_id;
    }
  } catch {
    return '(content unavailable — may have been removed)';
  }
}

/** Previews for a list of reports, by report id. */
export function useReportPreviews(reports: ReportWithReporter[]) {
  const ids = reports.map(report => report.id);
  return useQuery({
    queryKey: queryKeys.admin.reportPreviews(ids),
    queryFn: async () => {
      const entries = await Promise.all(reports.map(async report => [report.id, await fetchPreview(report)] as const));
      return Object.fromEntries(entries) as Record<string, string>;
    },
    enabled: reports.length > 0,
    staleTime: 60 * 1000,
  });
}

/** The action that removes what a report is about; the report is then marked resolved. */
async function applyReportAction(report: ReportWithReporter) {
  switch (report.target_type) {
    case 'listing':
    case 'product':
      return updateListingStatus(report.target_id, 'inactive');
    case 'user':
      return setProfileSuspended(report.target_id, true);
    case 'review':
      // A reported review is hidden, never deleted; the report's own reason is the hidden reason (1-500 characters).
      return hideReview(report.target_id, `Reported: ${report.reason}`.slice(0, 500));
    case 'message':
      return redactMessage(report.target_id);
    case 'expert':
      // Since A3a an expert is suspended like every other account (profiles.is_suspended), not through their
      // verification.
      return setProfileSuspended(report.target_id, true);
    default:
      return undefined;
  }
}

/** Takes the action a report calls for, then resolves the report. */
export function useModerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ report }: { report: ReportWithReporter }) => {
      await applyReportAction(report);
      await resolveReport(report.id, null);
    },
    // The action can remove a listing, review or message, or suspend a user or an expert, so those refetch too.
    onSuccess: () =>
      Promise.all(
        [queryKeys.admin.all, queryKeys.marketplace.all, queryKeys.reviews.all, queryKeys.experts.all].map(queryKey =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
}

export function useDismissReport() {
  const invalidate = useInvalidateAdmin();
  return useMutation({ mutationFn: (reportId: string) => dismissReport(reportId, null), onSuccess: invalidate });
}

// ---- AI module (A6; SRDS §37)

// The AI keys sit under queryKeys.admin.all, so a sign-out or an admin-wide refresh clears them with the rest.
const aiKeys = {
  activity: () => [...queryKeys.admin.all, 'ai-activity'] as const,
  knowledge: () => [...queryKeys.admin.all, 'disease-knowledge'] as const,
  knowledgeEntry: (classLabel: string) => [...queryKeys.admin.all, 'disease-knowledge', classLabel] as const,
};

export function useAiActivity() {
  return useQuery({ queryKey: aiKeys.activity(), queryFn: fetchAiActivity, staleTime: 0 });
}

export function useDiseaseKnowledge() {
  return useQuery({ queryKey: aiKeys.knowledge(), queryFn: fetchDiseaseKnowledge, staleTime: 0 });
}

export function useDiseaseKnowledgeEntry(classLabel: string) {
  return useQuery({
    queryKey: aiKeys.knowledgeEntry(classLabel),
    queryFn: () => fetchDiseaseKnowledgeEntry(classLabel),
    staleTime: 0,
  });
}

/** Puts the server's copy of an entry into the cache and refreshes the list, which shows its review status. */
function useStoreKnowledgeEntry() {
  const queryClient = useQueryClient();
  return (entry: DiseaseKnowledgeEntry) => {
    queryClient.setQueryData(aiKeys.knowledgeEntry(entry.class_label), entry);
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: aiKeys.knowledge(), exact: true }),
      // Farmers read the same text in the disease report, so their copy refreshes too.
      queryClient.invalidateQueries({ queryKey: queryKeys.disease.all }),
    ]);
  };
}

export function useUpdateDiseaseKnowledge() {
  const store = useStoreKnowledgeEntry();
  return useMutation({
    mutationFn: ({ classLabel, changes }: { classLabel: string; changes: DiseaseKnowledgeUpdate }) =>
      updateDiseaseKnowledge(classLabel, changes),
    onSuccess: store,
  });
}

export function useReviewDiseaseKnowledge() {
  const store = useStoreKnowledgeEntry();
  return useMutation({ mutationFn: (classLabel: string) => reviewDiseaseKnowledge(classLabel), onSuccess: store });
}

// ---- orders (SRDS §14)

export function useAdminOrder(orderId: string) {
  return useQuery({ queryKey: moderationKeys.order(orderId), queryFn: () => fetchOrderForAdmin(orderId), staleTime: 0 });
}

/** An admin cancellation changes the order for its buyer and seller too, so their order lists refetch. */
export function useCancelOrderAsAdmin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) => cancelOrderAsAdmin(orderId, reason),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      ]),
  });
}

// ---- consultations (SRDS §14)

export function useAdminConsultations(status: ConsultationStatus | undefined, olderThanDays: number | undefined) {
  return useQuery({
    queryKey: moderationKeys.consultations(status, olderThanDays),
    queryFn: () => fetchConsultationsForAdmin({ status, olderThanDays }),
    staleTime: 0,
  });
}

export function useAdminConsultation(consultationId: string) {
  return useQuery({
    queryKey: moderationKeys.consultation(consultationId),
    queryFn: () => fetchConsultationForAdmin(consultationId),
    staleTime: 0,
  });
}

/** Closing or cancelling a consultation changes it for the farmer and the expert too. */
export function useModerateConsultation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: 'close' | 'cancel'; reason: string }) =>
      moderateConsultation(id, { action, reason }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.consultations.all }),
      ]),
  });
}

// ---- reviews (SRDS §14)

export function useModerationReviews() {
  return useQuery({ queryKey: moderationKeys.reviews(), queryFn: fetchReviewsForModeration, staleTime: 0 });
}

/** Hiding or restoring a review changes what buyers read on the listing and the seller's rating. */
export function useSetReviewHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string | null }) => (reason === null ? restoreReview(id) : hideReview(id, reason)),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all }),
      ]),
  });
}
