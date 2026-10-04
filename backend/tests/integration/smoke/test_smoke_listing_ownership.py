"""Write scope for listings and expert applications (migration 20260928090000; BR-06, BR-15).

Only the owner edits or removes a listing; an admin moderates its status, with a second factor, through the audited
route; an expert's application starts pending. Each test drives real users through the API and through Supabase
PostgREST with the same sessions, and requires both doors to refuse what the other refuses.
"""

from __future__ import annotations

import os
import uuid

import httpx

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")


def rest(method: str, table: str, token: str, query: str = "", body: dict | None = None) -> httpx.Response:
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    return httpx.request(method, f"{LOCAL_URL}/rest/v1/{table}?{query}", headers=headers, json=body, timeout=30)


def refused_by_database(response: httpx.Response) -> bool:
    return response.status_code in (401, 403) and response.json()["code"] == "42501"


def audit_rows(target_id: str) -> list[dict]:
    response = httpx.get(
        f"{LOCAL_URL}/rest/v1/audit_logs",
        params={"target_id": f"eq.{target_id}", "select": "action"},
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()


def new_listing(api_client, world) -> str:
    created = api_client(
        "POST",
        "/api/v1/marketplace/listings",
        world.farmer.token,
        json={
            "title": f"Ownership {uuid.uuid4().hex[:6]}",
            "price": 10.0,
            "unit": "kg",
            "quantity": 5,
            "category_id": world.category_id,
        },
    )
    assert created.status_code in (200, 201), created.text
    return created.json()["id"]


def title_of(api_client, listing_id: str, token: str) -> str:
    return api_client("GET", f"/api/v1/marketplace/listings/{listing_id}", token).json()["title"]


def test_only_the_owner_edits_or_removes_a_listing(world, api_client, make_actor):
    listing_id = new_listing(api_client, world)
    other_farmer = make_actor("farmer")[2]
    before = title_of(api_client, listing_id, world.farmer.token)

    for token in (other_farmer, world.admin.token):
        edited = api_client("PATCH", f"/api/v1/marketplace/listings/{listing_id}", token, json={"title": "Taken over"})
        assert edited.status_code == 404, edited.text
        removed = api_client("DELETE", f"/api/v1/marketplace/listings/{listing_id}", token)
        assert removed.status_code == 404, removed.text
    assert title_of(api_client, listing_id, world.farmer.token) == before
    assert audit_rows(listing_id) == []

    edited = api_client(
        "PATCH", f"/api/v1/marketplace/listings/{listing_id}", world.farmer.token, json={"title": "Mine"}
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["title"] == "Mine"
    removed = api_client("DELETE", f"/api/v1/marketplace/listings/{listing_id}", world.farmer.token)
    assert removed.status_code == 204, removed.text


def test_an_admin_moderates_the_status_only_with_a_second_factor(world, api_client, matrix_actors):
    listing_id = new_listing(api_client, world)
    path = f"/api/v1/marketplace/listings/{listing_id}/status"

    refused = api_client("PATCH", path, matrix_actors["admin_aal1"], json={"status": "inactive"})
    assert refused.status_code == 403, refused.text
    assert refused.json()["code"] == "mfa_required"
    assert audit_rows(listing_id) == []

    allowed = api_client("PATCH", path, world.admin.token, json={"status": "inactive"})
    assert allowed.status_code == 204, allowed.text
    assert [row["action"] for row in audit_rows(listing_id)] == ["update_listing_status"]

    missing = api_client(
        "PATCH", f"/api/v1/marketplace/listings/{uuid.uuid4()}/status", world.admin.token, json={"status": "inactive"}
    )
    assert missing.status_code == 404, missing.text


def test_direct_database_writes_obey_the_same_scope(world, api_client):
    listing_id = new_listing(api_client, world)
    admin = world.admin.token  # aal2

    price = rest("PATCH", "listings", admin, f"id=eq.{listing_id}", {"price": 1})
    assert refused_by_database(price), price.text
    removed = rest("DELETE", "listings", admin, f"id=eq.{listing_id}")
    assert removed.status_code == 200, removed.text
    assert removed.json() == []
    forged = rest("POST", "listings", admin, body={"owner_id": world.farmer.id, "title": "Listed for them", "price": 5})
    assert refused_by_database(forged), forged.text
    status = rest("PATCH", "listings", admin, f"id=eq.{listing_id}", {"status": "inactive"})
    assert status.status_code == 200, status.text
    assert len(status.json()) == 1


def test_an_expert_cannot_apply_already_approved(make_actor, api_client, world):
    expert_id, _, token = make_actor("expert")
    forged = rest("POST", "experts", token, body={"id": expert_id, "verification_status": "approved"})
    assert forged.status_code == 400, forged.text
    assert "starts pending" in forged.json()["message"]
    assert api_client("GET", f"/api/v1/expert/{expert_id}", world.farmer.token).status_code == 404

    applied = rest("POST", "experts", token, body={"id": expert_id})
    assert applied.status_code == 201, applied.text
    assert applied.json()[0]["verification_status"] == "pending"
    decided = rest("POST", "expert_verifications", token, body={"expert_id": expert_id, "decision": "approved"})
    assert refused_by_database(decided), decided.text
    filed = rest("POST", "expert_verifications", token, body={"expert_id": expert_id, "document_url": "x/cert.jpg"})
    assert filed.status_code == 201, filed.text


def test_a_decision_that_cannot_happen_is_not_audited(world, api_client, make_actor):
    # The review route decided and audited an expert that did not exist (independent verification of 20260928090000).
    # Since A3a the decision and its audit row are one transaction (decide_account_status), so a refused decision
    # leaves no row by construction; these pin it.
    decision = {"decision": "approved", "notes": "smoke"}
    missing_id = str(uuid.uuid4())
    missing = api_client("PATCH", f"/api/v1/expert/admin/{missing_id}/verification", world.admin.token, json=decision)
    assert missing.status_code == 404, missing.text
    assert audit_rows(missing_id) == []

    # A real expert who has not sent an application yet cannot be approved.
    expert_id, _, _ = make_actor("expert")
    early = api_client("PATCH", f"/api/v1/expert/admin/{expert_id}/verification", world.admin.token, json=decision)
    assert early.status_code == 409, early.text
    assert early.json()["code"] == "invalid_transition"
    assert audit_rows(expert_id) == []
