from fastapi import HTTPException

from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
from app.common.marketplace import repository as repo


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
) -> list[dict]:
    return await repo.fetch_listings(
        category_id, search, min_price, max_price, seller_role, city, crop_name, page, owner_id
    )


async def fetch_listing_by_id(listing_id: str) -> dict:
    listing = await repo.fetch_listing_by_id(listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


async def fetch_categories() -> list[dict]:
    return await repo.fetch_categories()


async def create_category(user: AuthenticatedUser, fields: dict) -> dict:
    created = await repo.create_category(user.access_token, fields)
    await log_admin_action(user, "create_category", "categories", created["id"], new_state=fields)
    return created


async def update_category(user: AuthenticatedUser, category_id: str, fields: dict) -> dict:
    updated = await repo.update_category(user.access_token, category_id, fields)
    await log_admin_action(user, "update_category", "categories", category_id, new_state=fields)
    return updated


async def delete_category(user: AuthenticatedUser, category_id: str) -> None:
    await repo.delete_category(user.access_token, category_id)
    await log_admin_action(user, "delete_category", "categories", category_id)


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
    }
    return await repo.create_listing(user.access_token, user.id, fields)


async def update_listing(user: AuthenticatedUser, listing_id: str, input) -> dict:
    provided = input.model_dump(exclude_unset=True)
    location_touched = any(k in provided for k in ("country", "province", "city"))
    fields = {k: v for k, v in provided.items() if k not in ("country", "province", "city")}
    if location_touched:
        fields["location"] = _location(provided.get("country"), provided.get("province"), provided.get("city"))
    return await repo.update_listing(user.access_token, listing_id, user.id, fields)


async def delete_listing(user: AuthenticatedUser, listing_id: str) -> None:
    await repo.delete_listing(user.access_token, listing_id, user.id)


async def update_listing_status(user: AuthenticatedUser, listing_id: str, status: str) -> None:
    await repo.update_listing_status(user.access_token, listing_id, status)
    await log_admin_action(user, "update_listing_status", "listings", listing_id, new_state={"status": status})


async def fetch_all_listings_for_moderation(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_all_listings_for_moderation(user.access_token)


async def record_listing_view(user: AuthenticatedUser, listing_id: str) -> None:
    await repo.record_listing_view(user.access_token, listing_id, user.id)


async def fetch_listing_view_counts(user: AuthenticatedUser, listing_ids: list[str]) -> dict[str, int]:
    return await repo.fetch_listing_view_counts(user.access_token, listing_ids)
