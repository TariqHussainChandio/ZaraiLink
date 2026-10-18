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
  /**
   * Moderation (SRDS §14): set when an admin hid the review, with the reason. A hidden review never reaches a public
   * list or a rating; only its author (on their own order or consultation) and the admin receive it.
   */
  hidden_at?: string | null;
  hidden_reason?: string | null;
}

export interface ReviewWithBuyer extends Review {
  buyer: { id: string; full_name: string; avatar_url: string | null } | null;
}
