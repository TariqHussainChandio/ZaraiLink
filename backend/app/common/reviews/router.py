from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_admin, require_authenticated_user
from ....core.pagination import Page, paginate
from ....schemas.reviews import (
    CreateConsultationReviewRequest,
    CreateReviewRequest,
    Review,
    ReviewWithBuyer,
)
from ....services import reviews_service as service

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])

# Reads are public — `grant select on public.reviews to anon` (reviews are shown on public
# listing/expert pages), matching rule 14's "decide from the actual policy" instruction.


@router.get("/{review_id}", response_model=ReviewWithBuyer)
async def get_review(review_id: str) -> dict:
    return await service.fetch_review_by_id(review_id)


@router.get("/by-order/{order_id}", response_model=ReviewWithBuyer | None)
async def get_review_by_order(order_id: str) -> dict | None:
    return await service.fetch_review_by_order_id(order_id)


@router.get("/by-consultation/{consultation_id}", response_model=ReviewWithBuyer | None)
async def get_review_by_consultation(consultation_id: str) -> dict | None:
    return await service.fetch_review_by_consultation_id(consultation_id)


@router.get("/by-listing/{listing_id}", response_model=list[ReviewWithBuyer])
async def list_reviews_for_listing(listing_id: str, page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_reviews_for_listing(listing_id))


@router.get("/by-seller/{seller_id}", response_model=list[ReviewWithBuyer])
async def list_reviews_for_seller(seller_id: str, page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_reviews_for_seller(seller_id))


@router.get("/by-expert/{expert_id}", response_model=list[ReviewWithBuyer])
async def list_reviews_for_expert(expert_id: str, page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_reviews_for_expert(expert_id))


# Writes: authenticated (any role — buying isn't role-exclusive in this marketplace), server
# derives seller_id/expert_id itself (see reviews_service's own docstring for why).


@router.post("", response_model=Review)
async def create_review(
    request: CreateReviewRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return await service.create_review(user, request.order_id, request.listing_id, request.rating, request.comment)


@router.post("/consultation", response_model=Review)
async def create_consultation_review(
    request: CreateConsultationReviewRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return await service.create_consultation_review(user, request.consultation_id, request.rating, request.comment)


@router.delete("/{review_id}", status_code=204)
async def delete_review(review_id: str, user: AuthenticatedUser = Depends(require_admin)) -> None:
    await service.delete_review(user, review_id)
