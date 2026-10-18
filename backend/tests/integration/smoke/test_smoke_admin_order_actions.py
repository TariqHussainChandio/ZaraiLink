"""A7 (SRDS §14, §51, BR-11, BR-15): the admin's two order actions, on real FastAPI over HTTP and the local stack.

* Cancel (POST /api/v1/admin/orders/{id}/cancel): before dispatch only (pending, confirmed, processing, ready), always
  with a reason both parties can read. No money moves: the platform holds none (BR-11).
* Resolve a dispute (PATCH /api/v1/orders/{id}/status on a disputed order, to completed or refunded): only on a
  disputed order, never by a participant, and always with a reason both parties read (admin_action_reason).

Each is allowed for an admin with a second factor (aal2) and leaves exactly one `order_administrative_action` audit row,
its kind in metadata.change. Refused: the same admin without the second factor (aal1), the buyer, the seller, a
stranger and an anonymous caller; a cancel after dispatch; a resolution of an order that is not disputed. A refused
action changes nothing and leaves no audit row.
"""

from __future__ import annotations

import os

import httpx
import pytest

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")

REASON = "Seller cannot be reached; buyer asked the platform to step in"
SETTLE_REASON = "Photos show the goods arrived as described"


def _audit_rows(order_id: str) -> list[dict]:
    response = httpx.get(
        f"{LOCAL_URL}/rest/v1/audit_logs",
        params={
            "target_id": f"eq.{order_id}",
            "select": "actor_id,action,target_entity,metadata,previous_state,new_state",
        },
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def _status(api_client, world, order_id: str) -> str:
    order = api_client("GET", f"/api/v1/orders/{order_id}", world.buyer.token)
    assert order.status_code == 200, order.text
    return order.json()["status"]


@pytest.fixture
def order_in(world, api_client):
    """Places a fresh order of the farmer's listing for `world.buyer`; its real participants walk it to `status`."""

    def _make(status: str) -> str:
        checkout = api_client(
            "POST",
            "/api/v1/orders/checkout",
            world.buyer.token,
            json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
        )
        assert checkout.status_code == 200, checkout.text
        order_id = checkout.json()[0]["id"]
        path = ["confirmed", "processing", "ready", "dispatched", "completed", "disputed"]
        for to_status in path[: path.index(status) + 1] if status != "pending" else []:
            actor = world.buyer if to_status == "disputed" else world.farmer
            moved = api_client("PATCH", f"/api/v1/orders/{order_id}/status", actor.token, json={"to": to_status})
            assert moved.status_code == 204, moved.text
        assert _status(api_client, world, order_id) == status
        return order_id

    return _make


@pytest.fixture
def refusers(world, matrix_actors, make_actor) -> dict[str, tuple[str | None, int, str | None]]:
    """Everyone but the aal2 admin: (token, expected status, expected error code)."""
    _, _, stranger_token = make_actor("buyer")
    return {
        "admin without a second factor": (matrix_actors["admin_aal1"], 403, "mfa_required"),
        "the buyer": (world.buyer.token, 403, None),
        "the seller": (world.farmer.token, 403, None),
        "a stranger": (stranger_token, 403, None),
        "anonymous": (None, 401, None),
    }


# --- cancel --------------------------------------------------------------------------------------------------------


def test_only_an_admin_with_a_second_factor_cancels_and_it_is_audited(world, api_client, order_in, refusers):
    order_id = order_in("confirmed")
    path = f"/api/v1/admin/orders/{order_id}/cancel"

    for who, (token, status, code) in refusers.items():
        refused = api_client("POST", path, token, json={"reason": REASON})
        assert refused.status_code == status, f"{who}: {refused.status_code} {refused.text}"
        if code:
            assert refused.json()["code"] == code, who
    # No reason, no cancellation - even for the admin (AdminCancelOrderRequest, guard_orders_update).
    assert api_client("POST", path, world.admin.token, json={"reason": "  "}).status_code == 422
    assert _status(api_client, world, order_id) == "confirmed"
    assert _audit_rows(order_id) == [], "a refused action must leave no audit row"

    cancelled = api_client("POST", path, world.admin.token, json={"reason": f" {REASON} "})
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert cancelled.json()["admin_action_reason"] == REASON

    # Both parties read the admin's reason on the order.
    for party in (world.buyer, world.farmer):
        seen = api_client("GET", f"/api/v1/orders/{order_id}", party.token)
        assert seen.status_code == 200, seen.text
        assert seen.json()["status"] == "cancelled"
        assert seen.json()["admin_action_reason"] == REASON

    rows = _audit_rows(order_id)
    assert len(rows) == 1, rows
    assert rows[0]["actor_id"] == world.admin.id
    assert rows[0]["action"] == "order_administrative_action"
    assert rows[0]["target_entity"] == "order"
    assert rows[0]["metadata"] == {"change": "cancel"}
    assert rows[0]["previous_state"] == {"status": "confirmed"}
    assert rows[0]["new_state"] == {"status": "cancelled", "admin_action_reason": REASON}


@pytest.mark.parametrize("status", ["pending", "processing", "ready"])
def test_the_admin_may_cancel_from_every_status_before_dispatch(world, api_client, order_in, status):
    order_id = order_in(status)
    cancelled = api_client(
        "POST", f"/api/v1/admin/orders/{order_id}/cancel", world.admin.token, json={"reason": REASON}
    )
    assert cancelled.status_code == 200, cancelled.text
    assert [row["metadata"]["change"] for row in _audit_rows(order_id)] == ["cancel"]


@pytest.mark.parametrize("status", ["dispatched", "completed", "disputed"])
def test_nothing_is_cancelled_once_it_has_left_the_seller(world, api_client, order_in, status):
    # D5: the goods have left the seller. The API says so (422); the database would refuse it again.
    order_id = order_in(status)
    refused = api_client("POST", f"/api/v1/admin/orders/{order_id}/cancel", world.admin.token, json={"reason": REASON})
    assert refused.status_code == 422, refused.text
    assert refused.json()["code"] == "invalid_transition"
    assert _status(api_client, world, order_id) == status
    assert _audit_rows(order_id) == []


def test_cancelling_an_order_that_does_not_exist_is_404(world, api_client):
    missing = "00000000-0000-4000-8000-000000000000"
    refused = api_client("POST", f"/api/v1/admin/orders/{missing}/cancel", world.admin.token, json={"reason": REASON})
    assert refused.status_code == 404, refused.text
    assert _audit_rows(missing) == []


# --- dispute resolution ----------------------------------------------------------------------------------------------


def test_only_an_admin_with_a_second_factor_resolves_a_dispute_and_it_is_audited(world, api_client, order_in, refusers):
    order_id = order_in("disputed")
    path = f"/api/v1/orders/{order_id}/status"

    for who, (token, status, code) in refusers.items():
        # A stranger cannot even see the order (orders_select_participants), so the status route answers 404 for it.
        status = 404 if who == "a stranger" else status
        refused = api_client("PATCH", path, token, json={"to": "completed", "reason": SETTLE_REASON})
        assert refused.status_code == status, f"{who}: {refused.status_code} {refused.text}"
        if code:
            assert refused.json()["code"] == code, who
    # Even the aal2 admin settles nothing without a reason both parties can read.
    no_reason = api_client("PATCH", path, world.admin.token, json={"to": "completed"})
    assert no_reason.status_code == 422, no_reason.text
    assert no_reason.json()["code"] == "validation_failed"
    assert _status(api_client, world, order_id) == "disputed"
    assert _audit_rows(order_id) == []

    resolved = api_client("PATCH", path, world.admin.token, json={"to": "completed", "reason": f" {SETTLE_REASON} "})
    assert resolved.status_code == 204, resolved.text
    for party in (world.buyer, world.farmer):
        seen = api_client("GET", f"/api/v1/orders/{order_id}", party.token)
        assert seen.json()["status"] == "completed"
        assert seen.json()["admin_action_reason"] == SETTLE_REASON

    rows = _audit_rows(order_id)
    assert len(rows) == 1, rows
    assert rows[0]["actor_id"] == world.admin.id
    assert rows[0]["action"] == "order_administrative_action"
    assert rows[0]["metadata"] == {"change": "resolve_dispute"}
    assert rows[0]["previous_state"] == {"status": "disputed"}
    assert rows[0]["new_state"] == {"status": "completed", "admin_action_reason": SETTLE_REASON}


def test_a_reason_from_a_participant_is_refused_and_changes_nothing(world, api_client, order_in):
    # Refused rather than dropped (and guard_orders_update would refuse it from a non-admin too): the order does not
    # move, no reason is stored, nothing is audited. Without the reason, the same move goes through.
    order_id = order_in("completed")
    path = f"/api/v1/orders/{order_id}/status"
    refused = api_client("PATCH", path, world.buyer.token, json={"to": "disputed", "reason": "I say so"})
    assert refused.status_code == 422, refused.text
    assert refused.json()["code"] == "validation_failed"
    order = api_client("GET", f"/api/v1/orders/{order_id}", world.buyer.token).json()
    assert order["status"] == "completed"
    assert order["admin_action_reason"] is None
    assert _audit_rows(order_id) == []
    assert api_client("PATCH", path, world.buyer.token, json={"to": "disputed"}).status_code == 204


def test_a_dispute_resolves_only_to_completed_or_refunded(world, api_client, order_in):
    order_id = order_in("disputed")
    path = f"/api/v1/orders/{order_id}/status"
    for to_status in ("cancelled", "pending", "dispatched"):
        refused = api_client("PATCH", path, world.admin.token, json={"to": to_status, "reason": SETTLE_REASON})
        assert refused.status_code == 422, f"{to_status}: {refused.text}"
    assert _audit_rows(order_id) == []
    settled = api_client("PATCH", path, world.admin.token, json={"to": "refunded", "reason": SETTLE_REASON})
    assert settled.status_code == 204, settled.text
    assert _status(api_client, world, order_id) == "refunded"
    assert [row["metadata"]["change"] for row in _audit_rows(order_id)] == ["resolve_dispute"]


@pytest.mark.parametrize("status", ["pending", "ready", "completed"])
def test_the_admin_cannot_use_the_status_route_on_an_order_that_is_not_disputed(world, api_client, order_in, status):
    # The admin is not a participant: outside a dispute the status route is the buyer's and the seller's alone (and a
    # dispatch would take the seller's stock with the admin's token).
    order_id = order_in(status)
    target = {"pending": "confirmed", "ready": "dispatched", "completed": "disputed"}[status]
    refused = api_client("PATCH", f"/api/v1/orders/{order_id}/status", world.admin.token, json={"to": target})
    assert refused.status_code == 403, refused.text
    assert _status(api_client, world, order_id) == status
    assert _audit_rows(order_id) == []
