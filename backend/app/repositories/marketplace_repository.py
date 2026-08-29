from typing import Any

from ..core.supabase_client import get_public_client, get_user_scoped_client

LISTING_SELECT = "*, category:categories(id,name,slug), owner:profiles(id,full_name,avatar_url)"
PAGE_SIZE = 20


def fetch_listings(
    category_id: str | None,
    search: str | None,
    min_price: float | None,
    max_price: float | None,
    seller_role: str | None,
    city_id: str | None,
    crop_name: str | None,
    page: int,
    owner_id: str | None = None,
) -> list[dict]:
    query = get_public_client().table("listings").select(LISTING_SELECT).order("created_at", desc=True)

    if category_id:
        query = query.eq("category_id", category_id)
    if owner_id:
        query = query.eq("owner_id", owner_id)
    if search:
        query = query.ilike("title", f"%{search}%")
    if min_price is not None:
        query = query.gte("price", min_price)
    if max_price is not None:
        query = query.lte("price", max_price)
    if seller_role:
        query = query.eq("seller_role", seller_role)
    if city_id:
        query = query.eq("location->>city_id", city_id)
    if crop_name:
        query = query.contains("crop_compatibility", [crop_name])

    start = page * PAGE_SIZE
    query = query.range(start, start + PAGE_SIZE - 1)
    return query.execute().data or []


def fetch_listing_by_id(listing_id: str) -> dict | None:
    response = get_public_client().table("listings").select(LISTING_SELECT).eq("id", listing_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def fetch_categories() -> list[dict]:
    return get_public_client().table("categories").select("*").order("name").execute().data or []


def create_category(access_token: str, fields: dict[str, Any]) -> dict:
    response = get_user_scoped_client(access_token).table("categories").insert(fields).select().single().execute()
    return response.data


def update_category(access_token: str, category_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("categories")
        .update(fields)
        .eq("id", category_id)
        .select()
        .single()
        .execute()
    )
    return response.data


def delete_category(access_token: str, category_id: str) -> None:
    get_user_scoped_client(access_token).table("categories").delete().eq("id", category_id).execute()


def fetch_crops() -> list[dict]:
    return get_public_client().table("crops").select("*").order("name").execute().data or []


def create_listing(access_token: str, owner_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("listings")
        .insert({"owner_id": owner_id, **fields})
        .select()
        .single()
        .execute()
    )
    return response.data


def update_listing(access_token: str, listing_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("listings")
        .update(fields)
        .eq("id", listing_id)
        .select()
        .single()
        .execute()
    )
    return response.data


def delete_listing(access_token: str, listing_id: str) -> None:
    get_user_scoped_client(access_token).table("listings").delete().eq("id", listing_id).execute()


def update_listing_status(access_token: str, listing_id: str, status: str) -> None:
    get_user_scoped_client(access_token).table("listings").update({"status": status}).eq("id", listing_id).execute()


def fetch_all_listings_for_moderation(access_token: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("listings")
        .select(LISTING_SELECT)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def record_listing_view(access_token: str, listing_id: str, viewer_id: str) -> None:
    get_user_scoped_client(access_token).table("listing_views").insert(
        {"listing_id": listing_id, "viewer_id": viewer_id}
    ).execute()


def fetch_listing_view_counts(access_token: str, listing_ids: list[str]) -> dict[str, int]:
    if not listing_ids:
        return {}
    rows = (
        get_user_scoped_client(access_token)
        .table("listing_views")
        .select("listing_id")
        .in_("listing_id", listing_ids)
        .execute()
        .data
        or []
    )
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["listing_id"]] = counts.get(row["listing_id"], 0) + 1
    return counts
