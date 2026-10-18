from datetime import UTC, datetime

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_public_client, get_user_scoped_client

# buyer reads profiles_public (20260923080100_profiles_public_view.sql), not profiles directly —
# these reads are public (get_public_client(), no auth at all in some cases), and profiles' own
# RLS only lets a caller see their own row, so a review's author name could never display
# otherwise.
REVIEW_SELECT = "*, buyer:profiles_public!reviews_buyer_id_fkey(id,full_name,avatar_url)"

# Every public read below adds `hidden_at is null` (SRDS §14 moderation, 20261023080000_admin_moderation.sql). The anon
# select policy already hides a hidden review, so this is defence in depth: it keeps the public pages and every rating
# average honest even if one of these reads is ever moved to a broader client (a service-role client sees every row).


async def get_order_for_review(access_token: str, order_id: str) -> dict | None:
    # User-scoped client, so this is also naturally RLS-restricted to the caller's own order.
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("orders")
        .select("id, seller_id, buyer_id, status, order_items(listing_id)")
        .eq("id", order_id)
        .limit(1)
        .execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def get_consultation_for_review(access_token: str, consultation_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("consultations")
        .select("id, user_id, expert_id, status")
        .eq("id", consultation_id)
        .limit(1)
        .execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def create_review(
    access_token: str,
    order_id: str,
    listing_id: str | None,
    seller_id: str,
    buyer_id: str,
    rating: int,
    comment: str | None,
) -> dict:
    # N1 fix: insert() has no .select() on the pinned postgrest-py client — the write's own
    # returning=representation default already includes the full row.
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("reviews")
        .insert(
            {
                "order_id": order_id,
                "listing_id": listing_id,
                "seller_id": seller_id,
                "buyer_id": buyer_id,
                "rating": rating,
                "comment": comment,
            }
        )
        .execute()
    )
    return first_row(response)


async def create_consultation_review(
    access_token: str,
    consultation_id: str,
    expert_id: str,
    buyer_id: str,
    rating: int,
    comment: str | None,
) -> dict:
    # N1 fix — see create_review's comment above.
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("reviews")
        .insert(
            {
                "order_id": None,
                "consultation_id": consultation_id,
                "seller_id": expert_id,
                "buyer_id": buyer_id,
                "rating": rating,
                "comment": comment,
            }
        )
        .execute()
    )
    return first_row(response)


async def fetch_review_by_id(review_id: str) -> dict | None:
    response = await (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .is_("hidden_at", "null")
        .eq("id", review_id)
        .limit(1)
        .execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def _fetch_one_review_for_subject(column: str, subject_id: str, viewer: tuple[str, str] | None) -> dict | None:
    """The one review of an order or a consultation. Anonymous: the public read, visible reviews only. Signed in
    (`viewer` = (access token, user id)): visible reviews plus the caller's own hidden one, so the author is told it was
    hidden (and why) instead of seeing it vanish and being offered "Write a Review" again for an order that already has
    one (reviews_one_per_order). The select policy allows the same set; the filter keeps it explicit (SRDS §14)."""
    if viewer is None:
        query = get_public_client().table("reviews").select(REVIEW_SELECT).is_("hidden_at", "null")
    else:
        access_token, user_id = viewer
        client = await get_user_scoped_client(access_token)
        query = client.table("reviews").select(REVIEW_SELECT).or_(f"hidden_at.is.null,buyer_id.eq.{user_id}")
    response = await query.eq(column, subject_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_review_by_order_id(order_id: str, viewer: tuple[str, str] | None = None) -> dict | None:
    return await _fetch_one_review_for_subject("order_id", order_id, viewer)


async def fetch_review_by_consultation_id(consultation_id: str, viewer: tuple[str, str] | None = None) -> dict | None:
    return await _fetch_one_review_for_subject("consultation_id", consultation_id, viewer)


async def fetch_reviews_for_listing(listing_id: str) -> list[dict]:
    response = await (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .is_("hidden_at", "null")
        .eq("listing_id", listing_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def fetch_reviews_for_seller(seller_id: str) -> list[dict]:
    response = await (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .is_("hidden_at", "null")
        .eq("seller_id", seller_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def fetch_reviews_for_expert(expert_id: str) -> list[dict]:
    response = await (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .is_("hidden_at", "null")
        .eq("seller_id", expert_id)
        .not_.is_("consultation_id", None)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


# Moderation reads and writes run on the admin's own token, never the service role: the select policy shows an admin
# every review (hidden ones too, to restore them) and reviews_admin_update with guard_reviews_update lets only an admin
# with a second factor change the three hidden_* columns (SRDS §14, admin_mfa_enforcement).


async def fetch_review_for_moderation(access_token: str, review_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("reviews").select("*").eq("id", review_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_reviews_for_moderation(access_token: str, include_hidden: bool) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("reviews").select(REVIEW_SELECT)
    if not include_hidden:
        query = query.is_("hidden_at", "null")
    response = await query.order("created_at", desc=True).range(*page_range()).execute()
    return as_rows(response)


async def set_review_hidden(access_token: str, review_id: str, reason: str | None) -> dict:
    # guard_reviews_update stamps hidden_at (the first hide time is kept) and hidden_by from the session, and clears
    # all three on restore, so the client only states the intent: a reason to hide, nothing to restore. The time sent
    # here only marks the row as hidden; the trigger replaces it with the database's own clock.
    client = await get_user_scoped_client(access_token)
    fields: dict[str, str | None] = (
        {"hidden_at": datetime.now(UTC).isoformat(), "hidden_reason": reason}
        if reason is not None
        else {"hidden_at": None, "hidden_reason": None}
    )
    response = await client.table("reviews").update(fields).eq("id", review_id).execute()
    return first_row(response)
