from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import marketplace_repository as repo
from .audit_log_service import log_admin_action


def _location(country: str | None, province: str | None, city: str | None) -> dict | None:
    if not country and not province and not city:
        return None
    return {"country": country, "province": province, "city": city}


def fetch_listings(
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
    return repo.fetch_listings(
        category_id, search, min_price, max_price, seller_role, city, crop_name, page, owner_id
    )


def fetch_listing_by_id(listing_id: str) -> dict:
    listing = repo.fetch_listing_by_id(listing_id)
    if listing is None:
        raise HTTPException(status_code=404, detail="Listing not found")
    return listing


def fetch_categories() -> list[dict]:
    return repo.fetch_categories()


def create_category(user: AuthenticatedUser, fields: dict) -> dict:
    created = repo.create_category(user.access_token, fields)
    log_admin_action(user, "create_category", "categories", created["id"], new_state=fields)
    return created


def update_category(user: AuthenticatedUser, category_id: str, fields: dict) -> dict:
    updated = repo.update_category(user.access_token, category_id, fields)
    log_admin_action(user, "update_category", "categories", category_id, new_state=fields)
    return updated


def delete_category(user: AuthenticatedUser, category_id: str) -> None:
    repo.delete_category(user.access_token, category_id)
    log_admin_action(user, "delete_category", "categories", category_id)


def fetch_crops() -> list[dict]:
    return repo.fetch_crops()


def create_listing(user: AuthenticatedUser, input) -> dict:
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
    return repo.create_listing(user.access_token, user.id, fields)


def update_listing(user: AuthenticatedUser, listing_id: str, input) -> dict:
    provided = input.model_dump(exclude_unset=True)
    location_touched = any(k in provided for k in ("country", "province", "city"))
    fields = {k: v for k, v in provided.items() if k not in ("country", "province", "city")}
    if location_touched:
        fields["location"] = _location(
            provided.get("country"), provided.get("province"), provided.get("city")
        )
    return repo.update_listing(user.access_token, listing_id, fields)


def delete_listing(user: AuthenticatedUser, listing_id: str) -> None:
    repo.delete_listing(user.access_token, listing_id)


def update_listing_status(user: AuthenticatedUser, listing_id: str, status: str) -> None:
    repo.update_listing_status(user.access_token, listing_id, status)
    log_admin_action(user, "update_listing_status", "listings", listing_id, new_state={"status": status})


def fetch_all_listings_for_moderation(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_all_listings_for_moderation(user.access_token)


def record_listing_view(user: AuthenticatedUser, listing_id: str) -> None:
    repo.record_listing_view(user.access_token, listing_id, user.id)


def fetch_listing_view_counts(user: AuthenticatedUser, listing_ids: list[str]) -> dict[str, int]:
    return repo.fetch_listing_view_counts(user.access_token, listing_ids)
