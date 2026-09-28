# common/reviews (app)

Ratings and reviews for orders, listings, sellers and consultations.

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26, §35
- **API side:** [`backend/app/common/reviews`](../../../backend/app/common/reviews/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `RatingStars`, `RatingSummary`, `ReviewCard`, `useListingReviews`, `createConsultationReview`, `deleteReview`, `fetchReviewByConsultationId`, `fetchReviewById`, `fetchReviewByOrderId`, `fetchReviewsForExpert`.

## Inside

`components/` · `hooks/` · `screens/` (1) · `services/` · `types/`. Tests sit beside the code they test.
