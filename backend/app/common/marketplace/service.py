from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
from app.common.errors import AppHTTPException
from app.common.marketplace import repository as repo

FOREIGN_PRODUCT = "You can link only your own inventory product"


def _for_viewer(listings: list[dict], user: AuthenticatedUser | None) -> list[dict]:
    """Which IMS product a listing sells from is the dealer's private inventory (SRDS §15): only the listing's owner
    gets `inventory_product_id` (My Listings and Edit Listing need it); everyone else, signed out, a buyer, another
    dealer or the admin, gets null."""
    for listing in listings:
        if user is None or listing.get("owner_id") != user.id:
            listing["inventory_product_id"] = None
    return listings


async def _with_availability(listings: list[dict], access_token: str | None = None) -> list[dict]:
    """Adds each listing's stock word. Browsing never fails because of it: the repository answers `unknown` when the
    answer cannot be had (the availability contract, D7: stock problems never block the marketplace)."""
    words = await repo.fetch_availability([listing["id"] for listing in listings], access_token)
    for listing in listings:
        listing["availability"] = words.get(listing["id"], "unknown")
    return listings


def _foreign_product(exc: APIError, fields: dict) -> bool:
    """True when the write was refused because the linked IMS product is not the caller's. The trigger
    guard_inventory_references (20261021080000_inventory_data_model.sql) raises 42501 for it; row-level security
    raises the same code for a seller the policies refuse, so the message tells the two apart and that refusal
    passes through unchanged."""
    return (
        exc.code == "42501"
        and fields.get("inventory_product_id") is not None
        and "row-level security" not in (exc.message or "")
    )


def _location(country: str | None, province: str | None, city: str | None) -> dict | None:
    if not country and not province and not city:
        return None
    return {"country": country, "province": province, "city": city}


async def fetch_listings(
    category_id: str | None = None,
    search: str | None = None,
    min_price: float | None = None,
    max_price: float | None = None,
    seller_role: str | None = None,
    city: str | None = None,
    crop_name: str | None = None,
    page: int = 0,
    owner_id: str | None = None,
    user: AuthenticatedUser | None = None,
) -> list[dict]:
    # A seller's own list (My Listings) includes what is hidden or sold, so they can restock or reopen it; everyone
    # else, the seller browsing included, sees what is for sale.
    own = user is not None and owner_id == user.id
    listings = await _with_availability(
        await repo.fetch_listings(
            category_id,
            search,
            min_price,
            max_price,
            seller_role,
            city,
            crop_name,
            page,
            owner_id,
            access_token=user.access_token if own and user else None,
        ),
        user.access_token if own and user else None,
    )
    return _for_viewer(listings, user)


async def fetch_listing_by_id(listing_id: str, user: AuthenticatedUser | None = None) -> dict:
    # Signed in, the owner also reaches their own hidden or sold listing; others still see only listings for sale.
    listing = await repo.fetch_listing_by_id(listing_id, user.access_token if user else None)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return _for_viewer(await _with_availability([listing], user.access_token if user else None), user)[0]


async def fetch_categories() -> list[dict]:
    return await repo.fetch_categories()


async def create_category(user: AuthenticatedUser, fields: dict) -> dict:
    created = await repo.create_category(user.access_token, fields)
    # The audit row is written atomically by the database (20261023080000).
    return created


async def update_category(user: AuthenticatedUser, category_id: str, fields: dict) -> dict:
    updated = await repo.update_category(user.access_token, category_id, fields)
    # The audit row is written atomically by the database (20261023080000).
    return updated


async def delete_category(user: AuthenticatedUser, category_id: str) -> None:
    await repo.delete_category(user.access_token, category_id)
    # The audit row is written atomically by the database (20261023080000).


async def fetch_crops() -> list[dict]:
    return await repo.fetch_crops()


async def create_listing(user: AuthenticatedUser, input) -> dict:
    fields = {
        "category_id": input.category_id,
        "title": input.title,
        "description": input.description,
        "price": input.price,
        "unit": input.unit,
        "quantity": input.quantity,
        "images": input.images,
        "brand": input.brand,
        "condition": input.condition,
        "crop_compatibility": input.crop_compatibility,
        "location": _location(input.country, input.province, input.city),
        "inventory_product_id": input.inventory_product_id,
    }
    try:
        return await repo.create_listing(user.access_token, user.id, fields)
    except APIError as exc:
        if _foreign_product(exc, fields):
            raise AppHTTPException(403, FOREIGN_PRODUCT, "forbidden") from exc
        raise


async def update_listing(user: AuthenticatedUser, listing_id: str, input) -> dict:
    provided = input.model_dump(exclude_unset=True)
    location_touched = any(k in provided for k in ("country", "province", "city"))
    fields = {k: v for k, v in provided.items() if k not in ("country", "province", "city")}
    if location_touched:
        fields["location"] = _location(provided.get("country"), provided.get("province"), provided.get("city"))
    try:
        return await repo.update_listing(user.access_token, listing_id, user.id, fields)
    except APIError as exc:
        if _foreign_product(exc, fields):
            raise AppHTTPException(403, FOREIGN_PRODUCT, "forbidden") from exc
        raise


async def delete_listing(user: AuthenticatedUser, listing_id: str) -> None:
    await repo.delete_listing(user.access_token, listing_id, user.id)


async def update_listing_status(user: AuthenticatedUser, listing_id: str, status: str) -> None:
    await repo.update_listing_status(user.access_token, listing_id, status)
    # SRDS §51 "product moderated" (BR-15).
    # The audit row is written atomically by the database (20261023080000).


async def fetch_all_listings_for_moderation(user: AuthenticatedUser) -> list[dict]:
    return _for_viewer(await repo.fetch_all_listings_for_moderation(user.access_token), user)


async def record_listing_view(user: AuthenticatedUser, listing_id: str) -> None:
    await repo.record_listing_view(user.access_token, listing_id, user.id)


async def fetch_listing_view_counts(user: AuthenticatedUser, listing_ids: list[str]) -> dict[str, int]:
    return await repo.fetch_listing_view_counts(user.access_token, listing_ids)
