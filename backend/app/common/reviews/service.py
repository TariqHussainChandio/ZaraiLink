from fastapi import HTTPException

from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
from app.common.reviews import repository as repo


async def create_review(
    user: AuthenticatedUser, order_id: str, listing_id: str | None, rating: int, comment: str | None
) -> dict:
    """
    The existing RLS policy (`reviews_insert_buyer_completed_order_or_consultation`) only checks
    that the order is the caller's own completed order — it does NOT check that a client-supplied
    seller_id/listing_id actually belongs to that order. That's a real gap (a buyer could attach
    a review to an arbitrary seller/listing using a real order_id as cover), not a stylistic
    choice, so unlike most other domains in this migration, seller_id/listing_id are NOT taken
    from the client at all here — seller_id is derived from the order record, and listing_id (if
    given) is validated against that order's actual order_items.
    """
    order = await repo.get_order_for_review(user.access_token, order_id)
    if order is None or order["buyer_id"] != user.id or order["status"] != "completed":
        raise HTTPException(status_code=404, detail="Eligible order not found")

    if listing_id is not None:
        valid_listing_ids = {item["listing_id"] for item in order.get("order_items") or []}
        if listing_id not in valid_listing_ids:
            raise HTTPException(status_code=422, detail="listing_id does not belong to this order")

    return await repo.create_review(
        user.access_token, order_id, listing_id, order["seller_id"], user.id, rating, comment
    )


async def create_consultation_review(
    user: AuthenticatedUser, consultation_id: str, rating: int, comment: str | None
) -> dict:
    """Same reasoning as create_review — expert_id is derived from the consultation record, not
    taken from the client, since the existing RLS check doesn't validate that association either."""
    consultation = await repo.get_consultation_for_review(user.access_token, consultation_id)
    if (
        consultation is None
        or consultation["user_id"] != user.id
        or consultation["status"] not in ("resolved", "closed")
    ):
        raise HTTPException(status_code=404, detail="Eligible consultation not found")

    return await repo.create_consultation_review(
        user.access_token, consultation_id, consultation["expert_id"], user.id, rating, comment
    )


async def fetch_review_by_id(review_id: str) -> dict:
    review = await repo.fetch_review_by_id(review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


async def fetch_review_by_order_id(order_id: str) -> dict | None:
    return await repo.fetch_review_by_order_id(order_id)


async def fetch_review_by_consultation_id(consultation_id: str) -> dict | None:
    return await repo.fetch_review_by_consultation_id(consultation_id)


async def fetch_reviews_for_listing(listing_id: str) -> list[dict]:
    return await repo.fetch_reviews_for_listing(listing_id)


async def fetch_reviews_for_seller(seller_id: str) -> list[dict]:
    return await repo.fetch_reviews_for_seller(seller_id)


async def fetch_reviews_for_expert(expert_id: str) -> list[dict]:
    return await repo.fetch_reviews_for_expert(expert_id)


async def delete_review(user: AuthenticatedUser, review_id: str) -> None:
    await repo.delete_review(user.access_token, review_id)
    await log_admin_action(user, "delete_review", "reviews", review_id)
