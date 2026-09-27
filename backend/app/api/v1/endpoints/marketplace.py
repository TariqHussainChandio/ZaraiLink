from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_admin, require_admin_aal2, require_authenticated_user
from ....core.pagination import Page, paginate, paginate_feed
from ....schemas.marketplace import (
    Category,
    CategoryInput,
    CategoryUpdateInput,
    Crop,
    Listing,
    ListingInput,
    ListingUpdateInput,
    ListingWithRelations,
    UpdateListingStatusRequest,
    ViewCountsRequest,
)
from ....services import marketplace_service as service

router = APIRouter(prefix="/api/v1/marketplace", tags=["marketplace"])

# Public reads — `grant select on public.listings/categories/crops to anon`; browsing the
# marketplace has never required being signed in.


@router.get("/listings", response_model=list[ListingWithRelations])
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
    pg: Page = Depends(paginate_feed),
) -> list[dict]:
    return pg.finish(
        await service.fetch_listings(
            category_id, search, min_price, max_price, seller_role, city, crop_name, page, owner_id
        )
    )


@router.get("/listings/moderation", response_model=list[ListingWithRelations])
async def list_listings_for_moderation(
    user: AuthenticatedUser = Depends(require_admin), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_all_listings_for_moderation(user))


@router.get("/listings/{listing_id}", response_model=ListingWithRelations)
async def get_listing(listing_id: str) -> dict:
    return await service.fetch_listing_by_id(listing_id)


@router.post("/listings", response_model=Listing)
async def create_listing(request: ListingInput, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return await service.create_listing(user, request)


@router.patch("/listings/{listing_id}", response_model=Listing)
async def update_listing(
    listing_id: str, request: ListingUpdateInput, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict:
    return await service.update_listing(user, listing_id, request)


@router.delete("/listings/{listing_id}", status_code=204)
async def delete_listing(listing_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> None:
    await service.delete_listing(user, listing_id)


# Admin moderation of a listing's status, audited. Like every other admin write it needs a second factor, matching the
# listings policy's admin branch (is_admin_aal2, migration 20260928090000); an admin cannot edit or delete the listing.
@router.patch("/listings/{listing_id}/status", status_code=204)
async def update_listing_status(
    listing_id: str, request: UpdateListingStatusRequest, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> None:
    await service.update_listing_status(user, listing_id, request.status)


@router.get("/categories", response_model=list[Category])
async def list_categories(page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_categories())


@router.post("/categories", response_model=Category)
async def create_category(request: CategoryInput, user: AuthenticatedUser = Depends(require_admin)) -> dict:
    return await service.create_category(user, request.model_dump())


@router.patch("/categories/{category_id}", response_model=Category)
async def update_category(
    category_id: str, request: CategoryUpdateInput, user: AuthenticatedUser = Depends(require_admin)
) -> dict:
    return await service.update_category(user, category_id, request.model_dump(exclude_unset=True))


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: str, user: AuthenticatedUser = Depends(require_admin)) -> None:
    await service.delete_category(user, category_id)


@router.get("/crops", response_model=list[Crop])
async def list_crops(page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_crops())


@router.post("/listings/{listing_id}/views", status_code=204)
async def record_listing_view(listing_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> None:
    await service.record_listing_view(user, listing_id)


@router.post("/listings/view-counts", response_model=dict[str, int])
async def get_listing_view_counts(
    request: ViewCountsRequest, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict[str, int]:
    return await service.fetch_listing_view_counts(user, request.listing_ids)
