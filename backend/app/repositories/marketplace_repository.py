from typing import Any

from postgrest import APIError
from postgrest.types import ReturnMethod

from ..core.pagination import page_range
from ..core.rows import as_rows, first_row
from ..core.supabase_client import get_public_client, get_user_scoped_client

# owner reads profiles_public (20260923080100_profiles_public_view.sql), not profiles directly —
# profiles' own RLS only lets a caller see their own row, so a buyer browsing listings could never
# see any seller's name otherwise (confirmed live: this returned "owner": null for every listing).
LISTING_SELECT = "*, category:categories(id,name,slug), owner:profiles_public(id,full_name,avatar_url)"
PAGE_SIZE = 20


async def fetch_listings(
    category_id: str | None,
    search: str | None,
    min_price: float | None,
    max_price: float | None,
    seller_role: str | None,
    city: str | None,
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
    if city:
        query = query.ilike("location->>city", f"%{city}%")
    if crop_name:
        query = query.contains("crop_compatibility", [crop_name])

    offset, end = page_range()
    if page:  # legacy `page` parameter (fixed 20 per page); limit/offset are the supported way now
        offset, end = page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1
    query = query.range(offset, end)
    response = await query.execute()
    return as_rows(response)


async def fetch_listing_by_id(listing_id: str) -> dict | None:
    response = (
        await get_public_client().table("listings").select(LISTING_SELECT).eq("id", listing_id).limit(1).execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_categories() -> list[dict]:
    response = await get_public_client().table("categories").select("*").order("name").range(*page_range()).execute()
    return as_rows(response)


async def create_category(access_token: str, fields: dict[str, Any]) -> dict:
    # N1 fix: insert() has no .select() on the pinned postgrest-py client — the write's own
    # returning=representation default already includes the full row.
    client = await get_user_scoped_client(access_token)
    response = await client.table("categories").insert(fields).execute()
    return first_row(response)


async def update_category(access_token: str, category_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("categories").update(fields).eq("id", category_id).execute()
    return first_row(response)


async def delete_category(access_token: str, category_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("categories").delete().eq("id", category_id).execute()


async def fetch_crops() -> list[dict]:
    response = await get_public_client().table("crops").select("*").order("name").range(*page_range()).execute()
    return as_rows(response)


async def create_listing(access_token: str, owner_id: str, fields: dict[str, Any]) -> dict:
    # N1 fix — see create_category's comment above.
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").insert({"owner_id": owner_id, **fields}).execute()
    return first_row(response)


async def update_listing(access_token: str, listing_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").update(fields).eq("id", listing_id).execute()
    return first_row(response)


async def delete_listing(access_token: str, listing_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("listings").delete().eq("id", listing_id).execute()


async def update_listing_status(access_token: str, listing_id: str, status: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("listings").update({"status": status}).eq("id", listing_id).execute()


async def fetch_all_listings_for_moderation(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("listings")
        .select(LISTING_SELECT)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def record_listing_view(access_token: str, listing_id: str, viewer_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    try:
        # returning=minimal: a viewer may insert a view row but cannot select it back (the select policy is for the
        # listing owner and admins), and the default "return the row" made every non-owner view fail with a 500.
        await (
            client.table("listing_views")
            .insert({"listing_id": listing_id, "viewer_id": viewer_id}, returning=ReturnMethod.minimal)
            .execute()
        )
    except APIError as exc:
        if exc.code != "42501":
            raise
        # Row-level security refuses a view of your own listing on purpose (an owner's own visits are not counted).


async def fetch_listing_view_counts(access_token: str, listing_ids: list[str]) -> dict[str, int]:
    if not listing_ids:
        return {}
    client = await get_user_scoped_client(access_token)
    response = await client.table("listing_views").select("listing_id").in_("listing_id", listing_ids).execute()
    rows = as_rows(response)
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["listing_id"]] = counts.get(row["listing_id"], 0) + 1
    return counts
