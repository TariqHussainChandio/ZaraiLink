import asyncio
import logging
from typing import Any

import httpx
from postgrest import APIError
from postgrest.types import ReturnMethod

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_public_client, get_user_scoped_client

# owner reads profiles_public (20260923080100_profiles_public_view.sql), not profiles directly —
# profiles' own RLS only lets a caller see their own row, so a buyer browsing listings could never
# see any seller's name otherwise (confirmed live: this returned "owner": null for every listing).
LISTING_SELECT = "*, category:categories(id,name,slug), owner:profiles_public(id,full_name,avatar_url)"
PAGE_SIZE = 20

logger = logging.getLogger(__name__)

# What the availability read can actually fail with (D7): the database refusing or timing out the call (a statement
# timeout, a broken join in the IMS tables) arrives as a PostgREST APIError; a dropped connection or a client timeout as
# an httpx.HTTPError; our own deadline below as a TimeoutError; an unreadable body or a malformed row as a ValueError
# (JSON and pydantic validation), KeyError or TypeError.
AVAILABILITY_FAULTS = (APIError, httpx.HTTPError, TimeoutError, KeyError, TypeError, ValueError)
# A locked or slow IMS table would otherwise hold the page for the role's statement timeout (8 s signed in): past this,
# the listing says `unknown` and the page answers (contract "Listing availability": a timeout shows unknown).
AVAILABILITY_TIMEOUT_SECONDS = 2.0


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
    access_token: str | None = None,
) -> list[dict]:
    # With the caller's token the policies add their own listings in every status (listings_select_active_or_owner);
    # without it, anon sees active listings only.
    client = await get_user_scoped_client(access_token) if access_token else get_public_client()
    query = client.table("listings").select(LISTING_SELECT).order("created_at", desc=True)

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


async def fetch_availability(listing_ids: list[str], access_token: str | None = None) -> dict[str, str]:
    """One `listing_availability` call for a page of listings (20261019080000_order_dispatch.sql). With the caller's
    token it also answers for their own hidden or sold listings, as the listing read does."""
    if not listing_ids:
        return {}
    try:
        client = await get_user_scoped_client(access_token) if access_token else get_public_client()
        response = await asyncio.wait_for(
            client.rpc("listing_availability", {"listing_ids": listing_ids}).execute(), AVAILABILITY_TIMEOUT_SECONDS
        )
        words = {row["listing_id"]: row["availability"] for row in as_rows(response)}
    except AVAILABILITY_FAULTS:
        # Since B3 the answer comes from the IMS stock tables, and an IMS problem never breaks browsing (SRDS §53.39,
        # D7): each listing then says `unknown` instead of the page failing. A programming error still raises.
        logger.warning("listing availability unavailable; showing unknown", exc_info=True)
        return dict.fromkeys(listing_ids, "unknown")
    # A listing the function did not answer for (hidden from this caller) is `unknown` too, never missing.
    return {listing_id: words.get(listing_id, "unknown") for listing_id in listing_ids}


async def fetch_listing_by_id(listing_id: str, access_token: str | None = None) -> dict | None:
    client = await get_user_scoped_client(access_token) if access_token else get_public_client()
    response = await client.table("listings").select(LISTING_SELECT).eq("id", listing_id).limit(1).execute()
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


# Edit and delete match the owner as well as the id: only the owner changes or removes a listing (BR-15). An admin
# moderates through update_listing_status instead, which is audited; anyone else matches no row and gets a 404.
async def update_listing(access_token: str, listing_id: str, owner_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").update(fields).eq("id", listing_id).eq("owner_id", owner_id).execute()
    return first_row(response)


async def delete_listing(access_token: str, listing_id: str, owner_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").delete().eq("id", listing_id).eq("owner_id", owner_id).execute()
    first_row(response)


async def update_listing_status(access_token: str, listing_id: str, status: str) -> None:
    # first_row: a listing that does not exist (or that the policies refuse) is a 404, so no audit row is written for
    # a change that did not happen.
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").update({"status": status}).eq("id", listing_id).execute()
    first_row(response)


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
