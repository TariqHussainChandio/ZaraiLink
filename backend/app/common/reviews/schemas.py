from pydantic import BaseModel, Field


class BuyerRef(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


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


class ReviewWithBuyer(Review):
    buyer: BuyerRef | None = None


class CreateReviewRequest(BaseModel):
    order_id: str
    listing_id: str | None = None
    rating: int = Field(ge=1, le=5)
    comment: str | None = None


class CreateConsultationReviewRequest(BaseModel):
    consultation_id: str
    rating: int = Field(ge=1, le=5)
    comment: str | None = None
