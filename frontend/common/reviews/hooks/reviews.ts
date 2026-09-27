import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createReview, fetchReviewsForListing } from '../../services/modules/reviews/reviewsService';
import { queryKeys } from './keys';

export function useListingReviews(listingId: string) {
  return useQuery({
    queryKey: queryKeys.reviews.forListing(listingId),
    queryFn: () => fetchReviewsForListing(listingId),
  });
}

interface CreateReviewVariables {
  orderId: string;
  listingId: string | null;
  rating: number;
  comment: string | null;
}

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
