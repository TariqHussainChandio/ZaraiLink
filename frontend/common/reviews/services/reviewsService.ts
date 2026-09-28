import { apiFetch } from '../../../services/api/client';
import type { Review, ReviewWithBuyer } from '../types/reviews';

/**
 * BR-07 (a buyer may only review their own completed order) is enforced server-side. The
 * backend derives `seller_id` from the order itself (never trusts a client-supplied value) and
 * validates `listingId`, if given, actually belongs to that order — see
 * backend/app/common/reviews/service.py for why: the database's own RLS check alone didn't
 * validate that association, a gap closed during the backend migration.
 */
export async function createReview(
  orderId: string,
  listingId: string | null,
  rating: number,
  comment: string | null,
): Promise<Review> {
  return apiFetch('/api/v1/reviews', {
    method: 'POST',
    body: { order_id: orderId, listing_id: listingId, rating, comment },
  });
}

/** Used by `ReportsScreen` to preview a reported review before deleting it. Public read. */
export async function fetchReviewById(reviewId: string): Promise<ReviewWithBuyer> {
  return apiFetch(`/api/v1/reviews/${reviewId}`);
}

/** Admin-only, enforced server-side. */
export async function deleteReview(reviewId: string): Promise<void> {
  await apiFetch(`/api/v1/reviews/${reviewId}`, { method: 'DELETE' });
}

/** `reviews_one_per_order` makes this at most one row — used to gate the "Write a Review" action. */
export async function fetchReviewByOrderId(orderId: string): Promise<ReviewWithBuyer | null> {
  return apiFetch(`/api/v1/reviews/by-order/${orderId}`);
}

export async function fetchReviewsForListing(listingId: string): Promise<ReviewWithBuyer[]> {
  return apiFetch(`/api/v1/reviews/by-listing/${listingId}`);
}

export async function fetchReviewsForSeller(sellerId: string): Promise<ReviewWithBuyer[]> {
  return apiFetch(`/api/v1/reviews/by-seller/${sellerId}`);
}

/** Reviews of an expert (`seller_id` reused to mean "the person being reviewed" — see Module 14's migration comment). */
export async function fetchReviewsForExpert(expertId: string): Promise<ReviewWithBuyer[]> {
  return apiFetch(`/api/v1/reviews/by-expert/${expertId}`);
}

export async function fetchReviewByConsultationId(consultationId: string): Promise<ReviewWithBuyer | null> {
  return apiFetch(`/api/v1/reviews/by-consultation/${consultationId}`);
}

/**
 * BR-07's consultation counterpart. The backend derives `expert_id` from the consultation
 * record itself, not from the client, for the same reason `createReview` derives `seller_id`.
 */
export async function createConsultationReview(
  consultationId: string,
  rating: number,
  comment: string | null,
): Promise<Review> {
  return apiFetch('/api/v1/reviews/consultation', {
    method: 'POST',
    body: { consultation_id: consultationId, rating, comment },
  });
}
