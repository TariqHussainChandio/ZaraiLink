"""P7 (7B) — the error contract: every kind of API failure arrives as problem+json with the documented stable `code`.

The mobile client decides what to do from `code` (sign out, show the suspended screen, retry, show its own message), so
the exact bodies the real API sends are recorded in frontend/services/api/__fixtures__/problems.json and the
client's unit tests replay them. This test produces each failure for real and fails if the API's answer no longer
matches its fixture, so the client tests can never drift from what the server does. After a deliberate change:
    UPDATE_PROBLEM_FIXTURES=1 python -m pytest tests/integration/smoke/test_smoke_error_contract.py
"""

from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path

import httpx

FIXTURES = Path(__file__).resolve().parents[4] / "frontend" / "services" / "api" / "__fixtures__" / "problems.json"
# Failures this test cannot provoke cheaply or safely are asserted where they happen and recorded here by hand:
# rate_limited (test_smoke_proxy_headers.py), payload_too_large (test_smoke_http_hardening.py), and the two server-side
# ones (a Supabase outage and an unexpected exception) which would need the stack broken on purpose.
HAND_WRITTEN = {"rate_limited", "payload_too_large", "service_unavailable", "server_error"}


def _observe(response: httpx.Response) -> dict:
    return {
        "status": response.status_code,
        "contentType": response.headers["content-type"].split(";")[0],
        "requestId": bool(response.headers.get("x-request-id")),
        "body": response.json(),
    }


def _stable(observed: dict) -> dict:
    """The parts of a body that are the same on every run (ids in paths and messages are normalised)."""
    body = dict(observed["body"])
    body["instance"] = _normalise(body.get("instance", ""))
    if "title" in body:
        body["title"] = _normalise(body["title"])
    return {**observed, "body": body}


def _normalise(text: str) -> str:
    return re.sub(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", "<uuid>", text)


def test_every_error_kind_matches_its_recorded_fixture(world, api_client, make_actor, matrix_actors):
    observed: dict[str, dict] = {}

    observed["unauthenticated"] = _observe(api_client("GET", "/api/v1/orders"))
    observed["token_invalid"] = _observe(api_client("GET", "/api/v1/orders", "not-a-real-token"))
    observed["insufficient_role"] = _observe(api_client("GET", "/api/v1/dealer/inventory", world.buyer.token))
    observed["mfa_required"] = _observe(
        api_client(
            "POST",
            "/api/v1/reference-data/units/rows",
            matrix_actors["admin_aal1"],
            json={"code": f"e{uuid.uuid4().hex[:6]}", "label": "x"},
        )
    )
    observed["not_found"] = _observe(api_client("GET", f"/api/v1/orders/{uuid.uuid4()}", world.buyer.token))
    observed["validation_failed"] = _observe(
        api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json={"cart_items": "nope"})
    )
    observed["insufficient_stock"] = _observe(
        api_client(
            "POST",
            "/api/v1/orders/checkout",
            world.buyer.token,
            json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 100000}]},
        )
    )
    key = {"Idempotency-Key": f"contract-{uuid.uuid4().hex}"}
    api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
        headers=key,
    )
    observed["idempotency_key_reused"] = _observe(
        api_client(
            "POST",
            "/api/v1/orders/checkout",
            world.buyer.token,
            json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 2}]},
            headers=key,
        )
    )

    # A user who has never called the API has no cached profile, so the first call after the suspension sees it.
    suspended_id, _, suspended_token = make_actor("buyer")
    suspend = api_client(
        "PATCH", f"/api/v1/admin/users/{suspended_id}/suspend", world.admin.token, json={"is_suspended": True}
    )
    assert suspend.status_code == 204, suspend.text
    observed["account_suspended"] = _observe(api_client("GET", "/api/v1/orders", suspended_token))

    for name, result in observed.items():
        assert result["contentType"] == "application/problem+json", name
        assert result["requestId"], f"{name}: no X-Request-ID on an error response"
        assert result["body"]["code"] == name, f"{name}: answered code {result['body'].get('code')}"

    stable = {name: _stable(result) for name, result in observed.items()}
    if os.environ.get("UPDATE_PROBLEM_FIXTURES") == "1":
        existing = json.loads(FIXTURES.read_text(encoding="utf-8")) if FIXTURES.exists() else {}
        FIXTURES.parent.mkdir(parents=True, exist_ok=True)
        FIXTURES.write_text(json.dumps({**existing, **stable}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    recorded = json.loads(FIXTURES.read_text(encoding="utf-8"))
    for name, result in stable.items():
        assert recorded[name] == result, f"{name} no longer matches {FIXTURES}"
    assert set(recorded) == set(stable) | HAND_WRITTEN, "the fixture file has entries this test does not produce"
