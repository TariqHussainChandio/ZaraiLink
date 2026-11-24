// Review hooks: load reviews and write one.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createReview, fetchReviewsForListing, fetchReviewsForSeller } from '../services/reviewsService';
import { queryKeys } from '../../../hooks/keys';

// Loads the reviews of a listing.
export function useListingReviews(listingId: string) {
  return useQuery({
    queryKey: queryKeys.reviews.forListing(listingId),
    queryFn: () => fetchReviewsForListing(listingId),
  });
}

/** Every review of a seller's orders: their shop rating on the seller page (D20). A public read, like a listing's. */
export function useSellerReviews(sellerId: string) {
  return useQuery({
    queryKey: queryKeys.reviews.forSeller(sellerId),
    queryFn: () => fetchReviewsForSeller(sellerId),
  });
}

// Inputs for writing an order review.
interface CreateReviewVariables {
  orderId: string;
  listingId: string | null;
  rating: number;
  comment: string | null;
}

// Saves an order review, then refreshes the related caches.
export function useCreateReview() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, listingId, rating, comment }: CreateReviewVariables) =>
      createReview(orderId, listingId, rating, comment),
    // The review shows on the order (so the "write a review" button goes away) and on the listing.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.reviews.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      ]),
  });
}
