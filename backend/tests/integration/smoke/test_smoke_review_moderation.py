"""A7 (SRDS §14 "moderate reviews", §51, BR-15): an admin hides a review with a reason and can restore it; nobody
deletes one. Real FastAPI over HTTP on the local Supabase stack, real users, two-user proofs throughout.

Allowed: the admin with a second factor (aal2) hides and restores, each leaving one `review_moderated` audit row.
Refused: the same admin without the second factor (aal1), the review's author, the seller it is about, a stranger and an
anonymous caller; none of them leaves an audit row. While hidden, the review is missing from every public read (by id,
by order, by listing, by seller, and so from every rating average built on those lists), and also from the seller's
view; its author still sees it on their own order, with the reason. Restoring brings it back everywhere.
"""

from __future__ import annotations

import os

import httpx
import pytest

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")

REASON = "Abusive language towards the seller"


def _audit_rows(review_id: str) -> list[dict]:
    """Every audit row about this review, read back with the service role."""
    response = httpx.get(
        f"{LOCAL_URL}/rest/v1/audit_logs",
        params={"target_id": f"eq.{review_id}", "select": "actor_id,action,target_entity,metadata,new_state"},
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def _review_row(review_id: str, admin_token: str) -> dict | None:
    """The stored row, hidden or not. Read with the admin's own token: the select policy shows an admin every review,
    and service_role holds no privilege on reviews (it is never used for them)."""
    response = httpx.get(
        f"{LOCAL_URL}/rest/v1/reviews",
        params={"id": f"eq.{review_id}", "select": "id,hidden_at,hidden_reason,hidden_by"},
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {admin_token}"},
        timeout=30,
    )
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None


@pytest.fixture
def reviewed_order(world, api_client) -> dict:
    """A fresh completed order of the farmer's listing, bought by `world.buyer`, with the buyer's review."""
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    for to_status in ("confirmed", "processing", "ready", "dispatched", "completed"):
        moved = api_client("PATCH", f"/api/v1/orders/{order_id}/status", world.farmer.token, json={"to": to_status})
        assert moved.status_code == 204, moved.text
    review = api_client(
        "POST",
        "/api/v1/reviews",
        world.buyer.token,
        json={"order_id": order_id, "listing_id": world.farmer_listing_id, "rating": 1, "comment": "moderate me"},
    )
    assert review.status_code in (200, 201), review.text
    return {"order_id": order_id, "review_id": review.json()["id"]}


def _ids(response: httpx.Response) -> set[str]:
    assert response.status_code == 200, response.text
    return {row["id"] for row in response.json()}


def _listing_and_seller_reviews(api_client, world, token: str | None = None) -> tuple[set[str], set[str]]:
    # Page size 100 is the cap; the review under test is the newest, so it is on the first page when visible.
    by_listing = _ids(api_client("GET", f"/api/v1/reviews/by-listing/{world.farmer_listing_id}?limit=100", token))
    by_seller = _ids(api_client("GET", f"/api/v1/reviews/by-seller/{world.farmer.id}?limit=100", token))
    return by_listing, by_seller


def test_only_an_admin_with_a_second_factor_hides_a_review(
    world, api_client, matrix_actors, make_actor, reviewed_order
):
    review_id = reviewed_order["review_id"]
    path = f"/api/v1/reviews/{review_id}/hide"
    _, _, stranger_token = make_actor("buyer")

    refusals = {
        "admin without a second factor": (matrix_actors["admin_aal1"], 403, "mfa_required"),
        "the review's author": (world.buyer.token, 403, "insufficient_role"),
        "the seller it is about": (world.farmer.token, 403, "insufficient_role"),
        "a stranger": (stranger_token, 403, "insufficient_role"),
        "anonymous": (None, 401, None),
    }
    for who, (token, status, code) in refusals.items():
        refused = api_client("PATCH", path, token, json={"reason": REASON})
        assert refused.status_code == status, f"{who}: {refused.status_code} {refused.text}"
        if code:
            assert refused.json()["code"] == code, who
    # A hide with no reason is refused even for the admin (reviews_hidden_reason_check, HideReviewRequest).
    assert api_client("PATCH", path, world.admin.token, json={"reason": "   "}).status_code == 422
    assert _review_row(review_id, world.admin.token)["hidden_at"] is None
    assert _audit_rows(review_id) == [], "a refused moderation must leave no audit row"

    hidden = api_client("PATCH", path, world.admin.token, json={"reason": f"  {REASON}  "})
    assert hidden.status_code == 200, hidden.text
    assert hidden.json()["hidden_reason"] == REASON
    assert hidden.json()["hidden_at"] is not None
    row = _review_row(review_id, world.admin.token)
    assert row["hidden_by"] == world.admin.id  # stamped by guard_reviews_update from the session, not the client

    rows = _audit_rows(review_id)
    assert len(rows) == 1, rows
    assert rows[0]["actor_id"] == world.admin.id
    assert rows[0]["action"] == "review_moderated"
    assert rows[0]["target_entity"] == "reviews"
    assert rows[0]["metadata"] == {"change": "hide"}
    assert rows[0]["new_state"]["hidden_reason"] == REASON


def test_a_hidden_review_leaves_every_public_read_and_comes_back_on_restore(world, api_client, reviewed_order):
    review_id, order_id = reviewed_order["review_id"], reviewed_order["order_id"]
    by_listing, by_seller = _listing_and_seller_reviews(api_client, world)
    assert review_id in by_listing
    assert review_id in by_seller

    assert (
        api_client("PATCH", f"/api/v1/reviews/{review_id}/hide", world.admin.token, json={"reason": REASON}).status_code
        == 200
    )

    # Public reads, anonymous and as the seller it is about: gone. The listing and seller lists are what every rating
    # average is computed from (RatingSummary, the seller and expert pages), so it no longer counts in any.
    for token in (None, world.farmer.token, world.buyer2.token):
        by_listing, by_seller = _listing_and_seller_reviews(api_client, world, token)
        assert review_id not in by_listing
        assert review_id not in by_seller
        assert api_client("GET", f"/api/v1/reviews/by-order/{order_id}", token).json() is None
    assert api_client("GET", f"/api/v1/reviews/{review_id}").status_code == 404
    # The database's own layer: the anon key reads nothing of it either (reviews_select_all).
    direct = httpx.get(
        f"{LOCAL_URL}/rest/v1/reviews",
        params={"id": f"eq.{review_id}"},
        headers={"apikey": ANON_KEY},
        timeout=30,
    )
    assert direct.status_code == 200
    assert direct.json() == []

    # Its author still sees it on their own order, with the reason, so the app shows it as hidden and offers no second
    # review (reviews_one_per_order) - but not in the public lists, where it would count in a rating.
    own = api_client("GET", f"/api/v1/reviews/by-order/{order_id}", world.buyer.token)
    assert own.status_code == 200, own.text
    assert own.json()["id"] == review_id
    assert own.json()["hidden_reason"] == REASON
    by_listing, by_seller = _listing_and_seller_reviews(api_client, world, world.buyer.token)
    assert review_id not in by_listing
    assert review_id not in by_seller

    # The admin's moderation list shows it only when asked for hidden reviews.
    assert review_id not in _ids(api_client("GET", "/api/v1/reviews/admin?limit=100", world.admin.token))
    assert review_id in _ids(
        api_client("GET", "/api/v1/reviews/admin?include_hidden=true&limit=100", world.admin.token)
    )

    restored = api_client("PATCH", f"/api/v1/reviews/{review_id}/restore", world.admin.token)
    assert restored.status_code == 200, restored.text
    assert restored.json()["hidden_at"] is None
    assert restored.json()["hidden_reason"] is None
    assert _review_row(review_id, world.admin.token) == {
        "id": review_id,
        "hidden_at": None,
        "hidden_reason": None,
        "hidden_by": None,
    }

    by_listing, by_seller = _listing_and_seller_reviews(api_client, world)
    assert review_id in by_listing
    assert review_id in by_seller
    assert api_client("GET", f"/api/v1/reviews/by-order/{order_id}").json()["id"] == review_id
    assert api_client("GET", f"/api/v1/reviews/{review_id}").status_code == 200

    changes = sorted(row["metadata"]["change"] for row in _audit_rows(review_id))
    assert changes == ["hide", "restore"]


def test_restore_is_refused_without_a_second_factor_and_for_a_visible_review(
    world, api_client, matrix_actors, reviewed_order
):
    review_id = reviewed_order["review_id"]
    path = f"/api/v1/reviews/{review_id}/restore"

    # Nothing to restore on a visible review: a conflict, not an audit row for a change that did not happen.
    assert api_client("PATCH", path, world.admin.token).status_code == 409
    assert _audit_rows(review_id) == []

    assert (
        api_client("PATCH", f"/api/v1/reviews/{review_id}/hide", world.admin.token, json={"reason": REASON}).status_code
        == 200
    )
    for token, status in ((matrix_actors["admin_aal1"], 403), (world.buyer.token, 403), (world.farmer.token, 403)):
        assert api_client("PATCH", path, token).status_code == status
    assert _review_row(review_id, world.admin.token)["hidden_reason"] == REASON
    assert [row["metadata"]["change"] for row in _audit_rows(review_id)] == ["hide"]

    assert api_client("PATCH", path, world.admin.token).status_code == 200
    assert sorted(row["metadata"]["change"] for row in _audit_rows(review_id)) == ["hide", "restore"]


def test_the_moderation_list_is_for_the_admin_only(world, api_client, matrix_actors):
    # A read: the admin role is enough, with or without the second factor.
    assert api_client("GET", "/api/v1/reviews/admin", world.admin.token).status_code == 200
    assert api_client("GET", "/api/v1/reviews/admin", matrix_actors["admin_aal1"]).status_code == 200
    assert api_client("GET", "/api/v1/reviews/admin", world.buyer.token).status_code == 403
    assert api_client("GET", "/api/v1/reviews/admin", world.farmer.token).status_code == 403
    assert api_client("GET", "/api/v1/reviews/admin").status_code == 401


def test_nobody_deletes_a_review(world, api_client, reviewed_order):
    review_id = reviewed_order["review_id"]
    # The API has no delete route any more, for anyone.
    for token in (world.admin.token, world.buyer.token):
        assert api_client("DELETE", f"/api/v1/reviews/{review_id}", token).status_code == 405
    # And the database refuses it even to an admin with a second factor going straight to PostgREST (delete revoked).
    direct = httpx.delete(
        f"{LOCAL_URL}/rest/v1/reviews",
        params={"id": f"eq.{review_id}"},
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {world.admin.token}"},
        timeout=30,
    )
    assert direct.status_code in (401, 403), direct.text
    assert _review_row(review_id, world.admin.token) is not None
    assert _audit_rows(review_id) == []
