import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRequiredDocument,
  decideDealerApplication,
  dismissReport,
  fetchAllRequiredDocuments,
  fetchAuditLogsPage,
  fetchDealerApplication,
  fetchDealerApplications,
  fetchModerationListingsPage,
  fetchOrdersPage,
  fetchPlatformStats,
  fetchProfilesPage,
  fetchReportsPage,
  resolveDealerDocumentUrl,
  resolveReport,
  setProfileSuspended,
  updateRequiredDocument,
  updateUserRole,
  type DealerApplicationForAdmin,
  type RequiredDocumentInput,
} from '../services/adminService';
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
  fetchListingById,
  updateCategory,
  updateListingStatus,
  type CategoryInput,
  type ListingStatus,
} from '../../common/marketplace';
import { fetchMessageById, redactMessage } from '../../common/messaging';
import { deleteReview, fetchReviewById } from '../../common/reviews';
import { statusMeta } from '../../common/constants/status';
import type { Role } from '../../common/constants/roles';
import type { Profile } from '../../common/types/profile';
import type { ReportStatus, ReportWithReporter } from '../types/reports';
import { queryKeys } from '../../hooks/keys';
import { formatRs } from '../../utils/money';
import { useAdminPages } from './useAdminPages';

/*
 * Every admin write below is audit-logged by the API (BR-15); the hooks only decide what refetches afterwards. The
 * admin data is never written to the on-disk cache (queryClient.ts persists public marketplace reads only).
 */

export function useAdminAnalytics() {
  return useQuery({ queryKey: queryKeys.admin.analytics(), queryFn: fetchAdminAnalytics });
}

export function usePlatformStats() {
  return useQuery({ queryKey: queryKeys.admin.stats(), queryFn: fetchPlatformStats });
}

/** Newest first. `entity` is the one table the API can filter on; other areas are matched by the screen. */
export function useAuditLogPages(entity: string | undefined, loadAll: boolean) {
  return useAdminPages(
    [...queryKeys.admin.auditLogs(), 'pages', entity ?? 'all'],
    offset => fetchAuditLogsPage({ targetEntity: entity }, offset),
    { loadAll },
  );
}

export function useOrderPages(loadAll: boolean) {
  return useAdminPages([...queryKeys.admin.orders(), 'pages'], fetchOrdersPage, { loadAll });
}

function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
}

// ---- users

export interface ProfileFilter {
  role?: Role;
  accountStatus?: Profile['account_status'];
}

/** Users, filtered by the server on role and account status. Dealer applications are decided from Approvals, after
 * reading them (A3b). */
export function useProfilePages(filter: ProfileFilter, loadAll: boolean) {
  return useAdminPages(
    [...queryKeys.admin.profiles(`${filter.role ?? 'any'}:${filter.accountStatus ?? 'any'}`), 'pages'],
    offset => fetchProfilesPage(filter, offset),
    { loadAll },
  );
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

export function useModerationListingPages(loadAll: boolean) {
  return useAdminPages([...queryKeys.admin.moderationListings(), 'pages'], fetchModerationListingsPage, { loadAll });
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

/** A photographed document's name and its fresh signed link. */
export interface DocumentLink {
  id: string;
  label: string;
  uri: string;
}

/**
 * Fresh links to a set of photographed documents, asked for each time the viewer opens (`enabled`) and dropped when it
 * closes, because a link lasts ten minutes. A document whose link cannot be had is left out; if none can, the query fails
 * and the viewer offers "Get a new link" (`refetch`).
 */
export function useApplicationDocumentLinks(
  role: 'dealer' | 'expert',
  applicantId: string,
  documents: { id: string; label: string }[],
  enabled: boolean,
) {
  const ids = documents.map(d => d.id).join(',');
  return useQuery({
    queryKey: [...queryKeys.admin.all, 'document-links', role, applicantId, ids],
    queryFn: async (): Promise<DocumentLink[]> => {
      const resolve = role === 'dealer' ? resolveDealerDocumentUrl : resolveExpertDocumentUrl;
      const results = await Promise.allSettled(documents.map(async d => ({ id: d.id, label: d.label, uri: await resolve(applicantId, d.id) })));
      const links = results.flatMap(result => (result.status === 'fulfilled' ? [result.value] : []));
      if (links.length === 0) throw new Error('No document link could be opened');
      return links;
    },
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
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

export function useReportPages(status: ReportStatus | undefined, loadAll: boolean) {
  return useAdminPages([...queryKeys.admin.reports(status), 'pages'], offset => fetchReportsPage(status, offset), { loadAll });
}

/** The reported item as the admin needs to judge it: what it is, what it says, and the facts around it. */
export interface ReportTarget {
  heading: string;
  /** The words themselves (a review's comment, a message), when the target has any. */
  body: string | null;
  facts: string[];
  /** The item could not be loaded (removed, or not visible). */
  unavailable?: boolean;
}

/**
 * Fetches what a report is about, per target type. A target that cannot be loaded (deleted, or not visible) reads as
 * unavailable instead of failing the sheet. A user has no single-account route in the API, so a reported user shows
 * without a name (backend work: GET /api/v1/admin/users/{id}).
 */
async function fetchReportTarget(report: ReportWithReporter): Promise<ReportTarget> {
  try {
    switch (report.target_type) {
      case 'listing':
      case 'product': {
        const listing = await fetchListingById(report.target_id);
        return {
          heading: listing.title,
          body: listing.description,
          facts: [
            `${formatRs(listing.price)} per ${listing.unit}`,
            `Seller: ${listing.owner?.full_name || 'Unknown'}`,
            `Now: ${statusMeta('listing', listing.status).label}`,
          ],
        };
      }
      case 'review': {
        const review = await fetchReviewById(report.target_id);
        return { heading: 'Review', body: review.comment ?? 'No comment, only a rating.', facts: [`Rated ${review.rating} out of 5`] };
      }
      case 'message': {
        const message = await fetchMessageById(report.target_id);
        return { heading: 'Message', body: message.body, facts: [] };
      }
      case 'expert': {
        const expert = await fetchExpertById(report.target_id);
        return { heading: expert.profile?.full_name || 'Expert', body: null, facts: ['An expert account'] };
      }
      case 'user':
        return { heading: 'A user account', body: null, facts: [`Account ${report.target_id.slice(0, 8)}`] };
      default:
        return { heading: 'Reported item', body: null, facts: [report.target_id] };
    }
  } catch {
    return { heading: 'This content is no longer available', body: null, facts: ['It may have been removed already.'], unavailable: true };
  }
}

/** The reported item behind one report, read when its sheet opens (not once for every row of the list). */
export function useReportTarget(report: ReportWithReporter | null) {
  return useQuery({
    queryKey: [...queryKeys.admin.reports(undefined), 'target', report?.id],
    queryFn: () => fetchReportTarget(report as ReportWithReporter),
    enabled: !!report,
    staleTime: 60 * 1000,
  });
}

/** The open reports, for the overview's "Needs you" list (AD-14): the first page only, and `more` says there are others. */
export function useOpenReports() {
  return useQuery({
    queryKey: [...queryKeys.admin.reports('open'), 'count'],
    queryFn: async () => {
      const page = await fetchReportsPage('open', 0);
      return { count: page.data.length, more: page.next !== null };
    },
    staleTime: 0,
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
      return deleteReview(report.target_id);
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

/** Takes the action a report calls for, then resolves the report with the admin's reason as its notes (BR-15). */
export function useModerateReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ report, notes }: { report: ReportWithReporter; notes: string }) => {
      await applyReportAction(report);
      await resolveReport(report.id, notes);
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
  return useMutation({
    mutationFn: ({ reportId, notes }: { reportId: string; notes: string }) => dismissReport(reportId, notes),
    onSuccess: invalidate,
  });
}
