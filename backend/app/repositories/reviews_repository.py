from ..core.pagination import page_range
from ..core.rows import as_rows, first_row
from ..core.supabase_client import get_public_client, get_user_scoped_client

# buyer reads profiles_public (20260923080100_profiles_public_view.sql), not profiles directly —
# these reads are public (get_public_client(), no auth at all in some cases), and profiles' own
# RLS only lets a caller see their own row, so a review's author name could never display
# otherwise.
REVIEW_SELECT = "*, buyer:profiles_public!reviews_buyer_id_fkey(id,full_name,avatar_url)"


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
    response = await get_public_client().table("reviews").select(REVIEW_SELECT).eq("id", review_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_review_by_order_id(order_id: str) -> dict | None:
    response = (
        await get_public_client().table("reviews").select(REVIEW_SELECT).eq("order_id", order_id).limit(1).execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_review_by_consultation_id(consultation_id: str) -> dict | None:
    response = await (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .eq("consultation_id", consultation_id)
        .limit(1)
        .execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_reviews_for_listing(listing_id: str) -> list[dict]:
    response = await (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
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
        .eq("seller_id", expert_id)
        .not_.is_("consultation_id", None)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def delete_review(access_token: str, review_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("reviews").delete().eq("id", review_id).execute()
