import type { ConsultationPriority, ConsultationStatus } from '../../../expert';

const PRIORITY_RANK: Record<ConsultationPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Cases still being worked on; everything else is finished one way or another. */
const ACTIVE_STATUSES: readonly ConsultationStatus[] = ['requested', 'accepted', 'in_progress'];

/** Nobody can add to these any more: the thread is read-only. (A resolved case still takes a follow-up question.) */
const CLOSED_STATUSES: readonly ConsultationStatus[] = ['closed', 'rejected', 'cancelled', 'expired'];

export const isActiveStatus = (status: ConsultationStatus) => ACTIVE_STATUSES.includes(status);
export const isClosedStatus = (status: ConsultationStatus) => CLOSED_STATUSES.includes(status);

/** The expert's queue: most urgent first, and within a priority the request that has waited longest (FA-16). */
export function sortRequests<T extends { priority: ConsultationPriority; created_at: string }>(requests: T[]): T[] {
  return [...requests].sort(
    (a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || Date.parse(a.created_at) - Date.parse(b.created_at),
  );
}
