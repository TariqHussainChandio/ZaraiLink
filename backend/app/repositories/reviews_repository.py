from ..core.supabase_client import get_public_client, get_user_scoped_client

REVIEW_SELECT = "*, buyer:profiles!reviews_buyer_id_fkey(id,full_name,avatar_url)"


def get_order_for_review(access_token: str, order_id: str) -> dict | None:
    # User-scoped client, so this is also naturally RLS-restricted to the caller's own order.
    response = (
        get_user_scoped_client(access_token)
        .table("orders")
        .select("id, seller_id, buyer_id, status, order_items(listing_id)")
        .eq("id", order_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def get_consultation_for_review(access_token: str, consultation_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("consultations")
        .select("id, user_id, expert_id, status")
        .eq("id", consultation_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def create_review(
    access_token: str,
    order_id: str,
    listing_id: str | None,
    seller_id: str,
    buyer_id: str,
    rating: int,
    comment: str | None,
) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("reviews")
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
        .select()
        .single()
        .execute()
    )
    return response.data


def create_consultation_review(
    access_token: str,
    consultation_id: str,
    expert_id: str,
    buyer_id: str,
    rating: int,
    comment: str | None,
) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("reviews")
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
        .select()
        .single()
        .execute()
    )
    return response.data


def fetch_review_by_id(review_id: str) -> dict | None:
    response = get_public_client().table("reviews").select(REVIEW_SELECT).eq("id", review_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def fetch_review_by_order_id(order_id: str) -> dict | None:
    response = get_public_client().table("reviews").select(REVIEW_SELECT).eq("order_id", order_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def fetch_review_by_consultation_id(consultation_id: str) -> dict | None:
    response = (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .eq("consultation_id", consultation_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def fetch_reviews_for_listing(listing_id: str) -> list[dict]:
    return (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .eq("listing_id", listing_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_reviews_for_seller(seller_id: str) -> list[dict]:
    return (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .eq("seller_id", seller_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_reviews_for_expert(expert_id: str) -> list[dict]:
    return (
        get_public_client()
        .table("reviews")
        .select(REVIEW_SELECT)
        .eq("seller_id", expert_id)
        .not_.is_("consultation_id", None)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def delete_review(access_token: str, review_id: str) -> None:
    get_user_scoped_client(access_token).table("reviews").delete().eq("id", review_id).execute()
