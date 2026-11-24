"""Review request and response shapes."""

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints


# A short reviewer reference shown with a review.
class BuyerRef(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


# One review row.
class Review(BaseModel):
    id: str
    order_id: str | None
    consultation_id: str | None
    listing_id: str | None
    seller_id: str
    buyer_id: str
    rating: int
    comment: str | None
    created_at: str
    # Moderation (SRDS §14): a hidden review is kept, with the reason, so an admin can restore it. Public readers never
    # receive a hidden row (the select policy and the repository filter); the author and the admin see these fields.
    hidden_at: str | None = None
    hidden_reason: str | None = None


# A review with its reviewer attached.
class ReviewWithBuyer(Review):
    buyer: BuyerRef | None = None


# Body for reviewing an order.
class CreateReviewRequest(BaseModel):
    order_id: str
    listing_id: str | None = None
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


# Body for reviewing a consultation.
class CreateConsultationReviewRequest(BaseModel):
    consultation_id: str
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


# Body for hiding a review; the reason is required.
class HideReviewRequest(BaseModel):
    # Matches reviews_hidden_reason_check (1-500 characters after trimming): a hidden review always says why.
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
