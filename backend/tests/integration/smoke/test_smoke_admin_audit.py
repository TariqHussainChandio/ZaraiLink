"""P5 (item 10, BR-15) — every admin write leaves an `audit_logs` row.

Each case performs the real admin action as a real admin (aal2 where the route demands it) and then reads
`audit_logs` back with the service role, asserting a row with the expected action for that exact target.
The last test ties the list below to the app: any mutating route an admin can reach (a second-factor route,
or a route whose declared roles include admin) that this file does not cover fails it, so a new admin write
cannot ship without either an audit assertion here or a deliberate entry in NOT_AUDITED with the reason.
The independent P5 verification found that guarding only the second-factor routes let `delete_review` lose
its audit call unnoticed; hence the wider guard.
"""

from __future__ import annotations

import os
import uuid

import httpx
import pytest
from pydantic import ValidationError
from route_walk import api_routes

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")
for _name, _value in (
    ("SUPABASE_URL", LOCAL_URL),
    ("SUPABASE_ANON_KEY", ANON_KEY),
    ("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY),
):
    if _value:
        os.environ.setdefault(_name, _value)

try:
    from app.auth.dependencies import declared_roles, require_admin_aal2
    from app.main import app
except ValidationError:
    app = None

COVERED = {
    ("PATCH", "/api/v1/admin/users/{profile_id}/suspend"),
    ("PATCH", "/api/v1/admin/users/{profile_id}/role"),
    ("PATCH", "/api/v1/admin/users/{profile_id}/account-status"),
    ("PATCH", "/api/v1/admin/reports/{report_id}/resolve"),
    ("PATCH", "/api/v1/admin/reports/{report_id}/dismiss"),
    ("PATCH", "/api/v1/expert/admin/{expert_id}/verification"),
    ("PATCH", "/api/v1/messaging/messages/{message_id}/redact"),
    ("POST", "/api/v1/reference-data/{table}/rows"),
    ("PATCH", "/api/v1/reference-data/{table}/rows/{row_id}"),
    ("DELETE", "/api/v1/reference-data/{table}/rows/{row_id}"),
    ("POST", "/api/v1/marketplace/categories"),
    ("PATCH", "/api/v1/marketplace/categories/{category_id}"),
    ("DELETE", "/api/v1/marketplace/categories/{category_id}"),
    ("PATCH", "/api/v1/marketplace/listings/{listing_id}/status"),
    ("DELETE", "/api/v1/reviews/{review_id}"),
}
NOT_AUDITED: dict[tuple[str, str], str] = {}


def _service_headers():
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def _audit_rows(actor_id: str, action: str, target_id: str) -> list[dict]:
    response = httpx.get(
        f"{LOCAL_URL}/rest/v1/audit_logs",
        params={"actor_id": f"eq.{actor_id}", "action": f"eq.{action}", "target_id": f"eq.{target_id}"},
        headers=_service_headers(),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def _assert_audited(world, action: str, target_id: str) -> None:
    rows = _audit_rows(world.admin.id, action, target_id)
    assert len(rows) == 1, f"expected one {action!r} audit row for {target_id}, found {len(rows)}"


def _insert_report(reporter_id: str, reporter_token: str) -> str:
    # As the reporter, through RLS: the service role has no grant on `reports`.
    response = httpx.post(
        f"{LOCAL_URL}/rest/v1/reports",
        json={"reporter_id": reporter_id, "target_type": "user", "target_id": str(uuid.uuid4()), "reason": "smoke"},
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {reporter_token}", "Prefer": "return=representation"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()[0]["id"]


def _patch(api_client, world, path, **body):
    return api_client("PATCH", path, world.admin.token, json=body or None)


def test_suspend_and_role_change_are_audited(world, api_client, make_actor):
    target_id = make_actor("buyer")[0]
    assert _patch(api_client, world, f"/api/v1/admin/users/{target_id}/suspend", is_suspended=True).status_code == 204
    _assert_audited(world, "suspend_user", target_id)
    assert _patch(api_client, world, f"/api/v1/admin/users/{target_id}/role", role="expert").status_code == 204
    _assert_audited(world, "change_role", target_id)


def test_resolving_and_dismissing_a_report_are_audited(world, api_client):
    resolved, dismissed = (
        _insert_report(world.buyer.id, world.buyer.token),
        _insert_report(world.buyer.id, world.buyer.token),
    )
    assert _patch(api_client, world, f"/api/v1/admin/reports/{resolved}/resolve", notes="ok").status_code == 204
    _assert_audited(world, "resolve_report", resolved)
    assert _patch(api_client, world, f"/api/v1/admin/reports/{dismissed}/dismiss", notes="no").status_code == 204
    _assert_audited(world, "dismiss_report", dismissed)


def test_an_expert_verification_decision_is_audited(world, api_client, make_actor):
    expert_id, _, expert_token = make_actor("expert")
    application = {
        "profile": {
            "qualifications": "PhD",
            "degree": "PhD",
            "experience": "5 years",
            "professional_description": "audit smoke",
            "contact": "audit@example.test",
            "specializations": ["plant_diseases"],
        }
    }
    assert api_client("POST", "/api/v1/expert/application", expert_token, json=application).status_code in (200, 201)
    verified = _patch(api_client, world, f"/api/v1/expert/admin/{expert_id}/verification", decision="approved")
    assert verified.status_code == 204, verified.text
    # The audit row is written by decide_account_status() in the decision's own transaction (SRDS §51 names).
    _assert_audited(world, "expert_application_approved", expert_id)


def test_a_dealer_application_decision_is_audited(world, api_client, make_actor):
    dealer_id = make_actor("dealer")[0]
    decided = _patch(api_client, world, f"/api/v1/admin/users/{dealer_id}/account-status", status="approved")
    assert decided.status_code == 200, decided.text
    _assert_audited(world, "dealer_application_approved", dealer_id)


def test_redacting_a_message_is_audited(world, api_client, make_actor):
    other_id = make_actor("buyer")[0]
    conversation = api_client(
        "POST", "/api/v1/messaging/conversations", world.buyer.token, json={"other_user_id": other_id}
    )
    assert conversation.status_code == 200, conversation.text
    sent = api_client(
        "POST",
        f"/api/v1/messaging/conversations/{conversation.json()['id']}/messages",
        world.buyer.token,
        json={"body": "audit me"},
    )
    message_id = sent.json()["id"]
    assert _patch(api_client, world, f"/api/v1/messaging/messages/{message_id}/redact").status_code == 204
    _assert_audited(world, "redact_message", message_id)


def test_reference_data_writes_are_audited(world, api_client):
    row = {"code": f"aud-{uuid.uuid4().hex[:6]}", "label": "Audit"}
    created = api_client("POST", "/api/v1/reference-data/units/rows", world.admin.token, json=row)
    assert created.status_code == 201, created.text
    row_id = created.json()["id"]
    _assert_audited(world, "create_reference_data", row_id)
    assert _patch(api_client, world, f"/api/v1/reference-data/units/rows/{row_id}", label="Audit 2").status_code == 204
    _assert_audited(world, "update_reference_data", row_id)
    assert api_client("DELETE", f"/api/v1/reference-data/units/rows/{row_id}", world.admin.token).status_code == 204
    _assert_audited(world, "delete_reference_data", row_id)


def test_category_writes_and_listing_moderation_are_audited(world, api_client):
    slug = f"aud-{uuid.uuid4().hex[:8]}"
    created = api_client(
        "POST", "/api/v1/marketplace/categories", world.admin.token, json={"name": "Audit", "slug": slug}
    )
    assert created.status_code in (200, 201), created.text
    category_id = created.json()["id"]
    _assert_audited(world, "create_category", category_id)
    assert _patch(api_client, world, f"/api/v1/marketplace/categories/{category_id}", name="Audit 2").status_code in (
        200,
        204,
    )
    _assert_audited(world, "update_category", category_id)
    deleted = api_client("DELETE", f"/api/v1/marketplace/categories/{category_id}", world.admin.token)
    assert deleted.status_code == 204, deleted.text
    _assert_audited(world, "delete_category", category_id)

    status = _patch(
        api_client, world, f"/api/v1/marketplace/listings/{world.farmer_listing_id}/status", status="active"
    )
    assert status.status_code == 204, status.text
    _assert_audited(world, "update_listing_status", world.farmer_listing_id)


def test_deleting_a_review_is_audited(world, api_client):
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    for to_status in ("confirmed", "processing", "ready", "completed"):
        moved = api_client("PATCH", f"/api/v1/orders/{order_id}/status", world.farmer.token, json={"to": to_status})
        assert moved.status_code == 204, moved.text
    review = api_client(
        "POST", "/api/v1/reviews", world.buyer.token, json={"order_id": order_id, "rating": 4, "comment": "audit"}
    )
    assert review.status_code in (200, 201), review.text
    review_id = review.json()["id"]
    assert api_client("DELETE", f"/api/v1/reviews/{review_id}", world.admin.token).status_code == 204
    _assert_audited(world, "delete_review", review_id)


def test_resolving_a_dispute_is_audited(world, api_client):
    """The order status route is open to participants, so the route-coverage guard below cannot see this admin path."""
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    for actor, to_status in (
        (world.farmer, "confirmed"),
        (world.farmer, "processing"),
        (world.farmer, "ready"),
        (world.farmer, "completed"),
        (world.buyer, "disputed"),
        (world.admin, "refunded"),
    ):
        moved = api_client("PATCH", f"/api/v1/orders/{order_id}/status", actor.token, json={"to": to_status})
        assert moved.status_code == 204, moved.text
    _assert_audited(world, "resolve_order_dispute", order_id)


def _walk(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _walk(sub)


def _admin_reachable(route) -> bool:
    calls = list(_walk(route.dependant))
    return require_admin_aal2 in calls or any("admin" in declared_roles.get(call, ()) for call in calls)


def test_every_admin_write_route_is_covered_or_explicitly_not_audited():
    if app is None:
        pytest.skip("no Supabase settings in this environment")
    actual = {
        (method, route.path)
        for route in api_routes(app)
        if _admin_reachable(route)
        for method in route.methods - {"GET"}
    }
    # Routes that admins can call as one of several roles (a seller editing their own listing) are audited
    # only when the admin path differs; list those with the reason in NOT_AUDITED rather than skipping them.
    assert actual == COVERED | set(NOT_AUDITED), (
        f"admin-reachable writes without an audit assertion: {sorted(actual - COVERED - set(NOT_AUDITED))}; "
        f"listed but no longer admin-reachable: {sorted((COVERED | set(NOT_AUDITED)) - actual)}"
    )
