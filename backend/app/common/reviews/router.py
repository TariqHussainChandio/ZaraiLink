from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import (
    AuthenticatedUser,
    get_optional_user,
    require_admin,
    require_admin_aal2,
    require_authenticated_user,
)
from app.common.pagination import Page, paginate
from app.common.reviews import service
from app.common.reviews.schemas import (
    CreateConsultationReviewRequest,
    CreateReviewRequest,
    HideReviewRequest,
    Review,
    ReviewWithBuyer,
)

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])

# Reads are public — `grant select on public.reviews to anon` (reviews are shown on public
# listing/expert pages), matching rule 14's "decide from the actual policy" instruction. A hidden review is never
# returned by these to anyone but its own author (SRDS §14 moderation), and never in a list or a rating.


# The admin's moderation list (SRDS §14), declared before /{review_id} so "admin" is not read as an id. A read, so the
# admin role is enough (aal1); include_hidden=true adds the hidden reviews so one can be restored.
@router.get("/admin", response_model=list[ReviewWithBuyer])
async def list_reviews_for_moderation(
    include_hidden: bool = Query(default=False),
    user: AuthenticatedUser = Depends(require_admin),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_reviews_for_moderation(user, include_hidden))


@router.get("/{review_id}", response_model=ReviewWithBuyer)
async def get_review(review_id: str) -> dict:
    return await service.fetch_review_by_id(review_id)


# Still public; a signed-in author also gets their own hidden review with its reason, so the order or consultation tells
# them it was hidden instead of offering "Write a Review" again (the migration's select policy allows the same).
@router.get("/by-order/{order_id}", response_model=ReviewWithBuyer | None)
async def get_review_by_order(
    order_id: str, user: AuthenticatedUser | None = Depends(get_optional_user)
) -> dict | None:
    return await service.fetch_review_by_order_id(order_id, user)


@router.get("/by-consultation/{consultation_id}", response_model=ReviewWithBuyer | None)
async def get_review_by_consultation(
    consultation_id: str, user: AuthenticatedUser | None = Depends(get_optional_user)
) -> dict | None:
    return await service.fetch_review_by_consultation_id(consultation_id, user)


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


# Moderation writes (SRDS §14): a review is hidden with a reason and can be restored; it is never deleted. Like every
# admin write they need a second factor, matching reviews_admin_update (is_admin_aal2). Audited (BR-15).
@router.patch("/{review_id}/hide", response_model=Review)
async def hide_review(
    review_id: str, request: HideReviewRequest, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> dict:
    return await service.hide_review(user, review_id, request.reason)


@router.patch("/{review_id}/restore", response_model=Review)
async def restore_review(review_id: str, user: AuthenticatedUser = Depends(require_admin_aal2)) -> dict:
    return await service.restore_review(user, review_id)
