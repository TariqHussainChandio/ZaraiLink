"""Products and SKUs (B2 sub-lane; SRDS §17): the dealer's own catalogue, separate from marketplace listings, and the
link from a listing the dealer owns to the product whose stock it sells (D8).
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.common.pagination import Page, paginate
from app.inventory import repository as repo
from app.inventory.errors import stock_errors
from app.inventory.schemas import ListingLinkInput, ProductInput, ProductUpdateInput, ProductView

PRODUCTS = "inventory_products"

router = APIRouter()


# --- service ----------------------------------------------------------------------------------------------------------


def product_view(row: dict, default_location_id: str | None) -> dict:
    """A product row with its embedded stock and listings (repository.PRODUCT_SELECT) made into a ProductView."""
    stock = [{"location_id": s["location_id"], "quantity": float(s["quantity"])} for s in row.get("stock") or []]
    view = {k: v for k, v in row.items() if k not in ("stock", "listings")}
    view["stock"] = stock
    view["total_quantity"] = sum(s["quantity"] for s in stock)
    view["default_location_quantity"] = sum(s["quantity"] for s in stock if s["location_id"] == default_location_id)
    view["listings"] = row.get("listings") or []
    return view


async def _default_location_id(user: AuthenticatedUser) -> str | None:
    default = await repo.fetch_default_location(user.access_token)
    return default["id"] if default else None


async def list_products(user: AuthenticatedUser, include_inactive: bool = False) -> list[dict]:
    rows = await repo.fetch_products(user.access_token, include_inactive)
    default_id = await _default_location_id(user)
    return [product_view(row, default_id) for row in rows]


async def get_product(user: AuthenticatedUser, product_id: str) -> dict:
    row = await repo.fetch_product(user.access_token, product_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_view(row, await _default_location_id(user))


async def create_product(user: AuthenticatedUser, fields: dict, threshold_given: bool = True) -> dict:
    # A product created without its own reorder threshold takes the dealer's default (inventory_alert_settings).
    if not threshold_given:
        settings = await repo.fetch_alert_settings(user.access_token)
        if settings is not None:
            fields["reorder_threshold"] = settings["default_reorder_threshold"]
    created = await repo.create_row(user.access_token, PRODUCTS, user.id, fields)
    return await get_product(user, created["id"])


async def update_product(user: AuthenticatedUser, product_id: str, fields: dict) -> dict:
    if fields:
        await repo.update_row(user.access_token, PRODUCTS, product_id, fields)
    return await get_product(user, product_id)


async def delete_product(user: AuthenticatedUser, product_id: str) -> None:
    """Unlinks its listings (they fall back to their own quantity, as before the IMS), then deletes the product, or
    deactivates it when the ledger already refers to it (SRDS §24-§25)."""
    await get_product(user, product_id)
    await repo.unlink_product_listings(user.access_token, user.id, product_id)
    await repo.delete_or_deactivate(user.access_token, PRODUCTS, product_id)


async def link_listing(user: AuthenticatedUser, product_id: str, listing_id: str) -> dict:
    """Points one of the dealer's own listings at this product, so its availability and dispatch use the product's
    stock at the default location (D8). A listing linked elsewhere moves to this product."""
    await get_product(user, product_id)
    if await repo.fetch_owned_listing(user.access_token, user.id, listing_id) is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    with stock_errors():
        await repo.set_listing_product(user.access_token, user.id, listing_id, product_id)
    return await get_product(user, product_id)


async def unlink_listing(user: AuthenticatedUser, product_id: str, listing_id: str) -> dict:
    listing = await repo.fetch_owned_listing(user.access_token, user.id, listing_id)
    if listing is None or listing.get("inventory_product_id") != product_id:
        raise HTTPException(status_code=404, detail="This listing is not linked to the product")
    await repo.set_listing_product(user.access_token, user.id, listing_id, None)
    return await get_product(user, product_id)


# --- routes -----------------------------------------------------------------------------------------------------------


@router.get("/products", response_model=list[ProductView])
async def get_products(
    include_inactive: bool = False, user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await list_products(user, include_inactive))


@router.post("/products", response_model=ProductView, status_code=201)
async def post_product(request: ProductInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await create_product(user, request.model_dump(), "reorder_threshold" in request.model_fields_set)


@router.get("/products/{product_id}", response_model=ProductView)
async def get_one_product(product_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await get_product(user, product_id)


@router.patch("/products/{product_id}", response_model=ProductView)
async def patch_product(
    product_id: str, request: ProductUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await update_product(user, product_id, request.model_dump(exclude_unset=True))


@router.delete("/products/{product_id}", status_code=204)
async def remove_product(product_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await delete_product(user, product_id)


@router.post("/products/{product_id}/listings", response_model=ProductView)
async def post_product_listing(
    product_id: str, request: ListingLinkInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await link_listing(user, product_id, request.listing_id)


@router.delete("/products/{product_id}/listings/{listing_id}", response_model=ProductView)
async def remove_product_listing(
    product_id: str, listing_id: str, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await unlink_listing(user, product_id, listing_id)
