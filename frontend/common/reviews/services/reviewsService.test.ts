import { apiFetch } from '../../api/client';
import {
  createConsultationReview,
  createReview,
  deleteReview,
  fetchReviewByConsultationId,
  fetchReviewByOrderId,
  fetchReviewById,
  fetchReviewsForExpert,
  fetchReviewsForListing,
  fetchReviewsForSeller,
} from './reviewsService';

jest.mock('../../api/client');

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createReview', () => {
  it('POSTs order/listing/rating/comment — never a client-derived sellerId', async () => {
    mockApiFetch.mockResolvedValue({});
    await createReview('order-1', 'listing-1', 5, 'Great produce');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews', {
      method: 'POST',
      body: { order_id: 'order-1', listing_id: 'listing-1', rating: 5, comment: 'Great produce' },
    });
  });

  it('accepts a null listingId and comment', async () => {
    mockApiFetch.mockResolvedValue({});
    await createReview('order-1', null, 3, null);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews', {
      method: 'POST',
      body: { order_id: 'order-1', listing_id: null, rating: 3, comment: null },
    });
  });
});

describe('reads', () => {
  it('fetchReviewById fetches a single review', async () => {
    mockApiFetch.mockResolvedValue({});
    await fetchReviewById('review-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/review-1');
  });

  it('fetchReviewByOrderId fetches the review for an order', async () => {
    mockApiFetch.mockResolvedValue(null);
    await fetchReviewByOrderId('order-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/by-order/order-1');
  });

  it('fetchReviewsForListing fetches reviews for a listing', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchReviewsForListing('listing-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/by-listing/listing-1');
  });

  it('fetchReviewsForSeller fetches reviews for a seller', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchReviewsForSeller('seller-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/by-seller/seller-1');
  });

  it('fetchReviewsForExpert fetches reviews for an expert', async () => {
    mockApiFetch.mockResolvedValue([]);
    await fetchReviewsForExpert('expert-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/by-expert/expert-1');
  });

  it('fetchReviewByConsultationId fetches the review for a consultation', async () => {
    mockApiFetch.mockResolvedValue(null);
    await fetchReviewByConsultationId('consult-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/by-consultation/consult-1');
  });
});

describe('deleteReview', () => {
  it('DELETEs the review', async () => {
    mockApiFetch.mockResolvedValue(undefined);
    await deleteReview('review-1');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/review-1', { method: 'DELETE' });
  });
});

describe('createConsultationReview', () => {
  it('POSTs to the consultation review endpoint — never a client-derived expertId', async () => {
    mockApiFetch.mockResolvedValue({});
    await createConsultationReview('consult-1', 4, 'Helpful advice');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/reviews/consultation', {
      method: 'POST',
      body: { consultation_id: 'consult-1', rating: 4, comment: 'Helpful advice' },
    });
  });
});
