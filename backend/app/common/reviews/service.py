from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
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


def _viewer(user: AuthenticatedUser | None) -> tuple[str, str] | None:
    return (user.access_token, user.id) if user is not None else None


async def fetch_review_by_order_id(order_id: str, user: AuthenticatedUser | None = None) -> dict | None:
    """Public; a signed-in author also gets their own hidden review, with the reason (SRDS §14, see the repository)."""
    return await repo.fetch_review_by_order_id(order_id, _viewer(user))


async def fetch_review_by_consultation_id(consultation_id: str, user: AuthenticatedUser | None = None) -> dict | None:
    return await repo.fetch_review_by_consultation_id(consultation_id, _viewer(user))


async def fetch_reviews_for_listing(listing_id: str) -> list[dict]:
    return await repo.fetch_reviews_for_listing(listing_id)


async def fetch_reviews_for_seller(seller_id: str) -> list[dict]:
    return await repo.fetch_reviews_for_seller(seller_id)


async def fetch_reviews_for_expert(expert_id: str) -> list[dict]:
    return await repo.fetch_reviews_for_expert(expert_id)


async def fetch_reviews_for_moderation(user: AuthenticatedUser, include_hidden: bool) -> list[dict]:
    return await repo.fetch_reviews_for_moderation(user.access_token, include_hidden)


def _raise_moderation_refusal(exc: APIError) -> None:
    # guard_reviews_update: 42501 for anyone but an admin with a second factor (or an edit beyond the hidden_* columns),
    # 23514 for a hide without a reason. Anything else stays the generic database error.
    if exc.code == "42501":
        raise HTTPException(status_code=403, detail="Only an admin with a second factor can moderate a review") from exc
    if exc.code == "23514":
        raise HTTPException(status_code=422, detail="Hiding a review needs a reason") from exc
    raise exc


async def hide_review(user: AuthenticatedUser, review_id: str, reason: str) -> dict:
    """
    SRDS §14 "moderate reviews": an admin hides a review with a reason instead of deleting it, so the review, its
    rating history and the decision stay on record and the decision can be undone (restore_review). Hiding an already
    hidden review only replaces the reason; the database keeps the first hide time. BR-15: the database audits it with
    the state before and after.
    """
    previous = await repo.fetch_review_for_moderation(user.access_token, review_id)
    if previous is None:
        raise HTTPException(status_code=404, detail="Review not found")
    try:
        updated = await repo.set_review_hidden(user.access_token, review_id, reason)
    except APIError as exc:
        _raise_moderation_refusal(exc)
        raise
    # The audit row is written atomically by the database (20261023080000).
    return updated


async def restore_review(user: AuthenticatedUser, review_id: str) -> dict:
    """Undoes hide_review: the review is public again and counts in ratings. A visible review has nothing to restore,
    so that is a conflict rather than a second audit row for a change that did not happen."""
    previous = await repo.fetch_review_for_moderation(user.access_token, review_id)
    if previous is None:
        raise HTTPException(status_code=404, detail="Review not found")
    if previous.get("hidden_at") is None:
        raise HTTPException(status_code=409, detail="This review is not hidden")
    try:
        updated = await repo.set_review_hidden(user.access_token, review_id, None)
    except APIError as exc:
        _raise_moderation_refusal(exc)
        raise
    # The audit row is written atomically by the database (20261023080000).
    return updated
