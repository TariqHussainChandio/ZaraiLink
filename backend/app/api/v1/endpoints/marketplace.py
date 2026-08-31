from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_admin, require_authenticated_user
from ....schemas.marketplace import (
    CategoryInput,
    CategoryUpdateInput,
    ListingInput,
    ListingUpdateInput,
    UpdateListingStatusRequest,
    ViewCountsRequest,
)
from ....services import marketplace_service as service

router = APIRouter(prefix="/api/v1/marketplace", tags=["marketplace"])

# Public reads — `grant select on public.listings/categories/crops to anon`; browsing the
# marketplace has never required being signed in.


@router.get("/listings")
async def list_listings(
    category_id: str | None = None,
    search: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    seller_role: str | None = None,
    city: str | None = None,
    crop_name: str | None = None,
    page: int = 0,
    owner_id: str | None = None,
) -> list[dict]:
    return service.fetch_listings(
        category_id, search, min_price, max_price, seller_role, city, crop_name, page, owner_id
    )


@router.get("/listings/moderation")
async def list_listings_for_moderation(user: AuthenticatedUser = Depends(require_admin)) -> list[dict]:
    return service.fetch_all_listings_for_moderation(user)


@router.get("/listings/{listing_id}")
async def get_listing(listing_id: str) -> dict:
    return service.fetch_listing_by_id(listing_id)


@router.post("/listings")
async def create_listing(request: ListingInput, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return service.create_listing(user, request)


@router.patch("/listings/{listing_id}")
async def update_listing(
    listing_id: str, request: ListingUpdateInput, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict:
    return service.update_listing(user, listing_id, request)


@router.delete("/listings/{listing_id}", status_code=204)
async def delete_listing(listing_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> None:
    service.delete_listing(user, listing_id)


# Status changes are admin-only in practice today (only the moderation screens call this,
# always with an audit-log entry) — preserved as-is, not loosened, even though RLS alone would
# also permit an owner to do this.
@router.patch("/listings/{listing_id}/status", status_code=204)
async def update_listing_status(
    listing_id: str, request: UpdateListingStatusRequest, user: AuthenticatedUser = Depends(require_admin)
) -> None:
    service.update_listing_status(user, listing_id, request.status)


@router.get("/categories")
async def list_categories() -> list[dict]:
    return service.fetch_categories()


@router.post("/categories")
async def create_category(request: CategoryInput, user: AuthenticatedUser = Depends(require_admin)) -> dict:
    return service.create_category(user, request.model_dump())


@router.patch("/categories/{category_id}")
async def update_category(
    category_id: str, request: CategoryUpdateInput, user: AuthenticatedUser = Depends(require_admin)
) -> dict:
    return service.update_category(user, category_id, request.model_dump(exclude_unset=True))


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str, user: AuthenticatedUser = Depends(require_admin)) -> None:
    service.delete_category(user, category_id)


@router.get("/crops")
async def list_crops() -> list[dict]:
    return service.fetch_crops()


@router.post("/listings/{listing_id}/views", status_code=204)
async def record_listing_view(listing_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> None:
    service.record_listing_view(user, listing_id)


@router.post("/listings/view-counts")
async def get_listing_view_counts(
    request: ViewCountsRequest, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict[str, int]:
    return service.fetch_listing_view_counts(user, request.listing_ids)
