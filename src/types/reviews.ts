export interface Review {
  id: string;
  /** Exactly one of `order_id`/`consultation_id` is ever set (Module 14 `reviews_exactly_one_subject`). */
  order_id: string | null;
  consultation_id: string | null;
  listing_id: string | null;
  /** "The person being reviewed" — a seller for order reviews, an expert for consultation reviews. */
  seller_id: string;
  buyer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface ReviewWithBuyer extends Review {
  buyer: { id: string; full_name: string; avatar_url: string | null } | null;
}
