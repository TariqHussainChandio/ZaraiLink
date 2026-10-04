"""SRDS §8, §11, §13, §50, §51 — a dealer or expert acts as one only once an admin has approved them (A3a, D10).

Dealers and experts sign up pending (profiles.account_status, migration 20261005080000). These tests drive real users
through both doors, FastAPI and Supabase PostgREST with the user's own session, and require the same answer: a pending
dealer is refused and an approved one allowed; nobody approves themselves; an admin decides only with a second factor,
and every decision leaves its audit row; a rejection carries a reason the applicant reads and may answer by
resubmitting; and a session from before the approval must sign in again.
"""

from __future__ import annotations

import os
import time

import httpx

REST = os.environ.get("LOCAL_SUPABASE_URL", "") + "/rest/v1"
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
REASON = "The business registration number does not match."


def refused_by_rls(response: httpx.Response) -> bool:
    return response.status_code == 403 and response.json()["code"] == "42501"


def rest(method: str, table: str, token: str, query: str = "", body: dict | None = None) -> httpx.Response:
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    return httpx.request(method, f"{REST}/{table}?{query}", headers=headers, json=body, timeout=30)


def decide(api_client, world, profile_id: str, status: str, reason: str | None = None) -> httpx.Response:
    body: dict = {"status": status}
    if reason is not None:
        body["reason"] = reason
    return api_client("PATCH", f"/api/v1/admin/users/{profile_id}/account-status", world.admin.token, json=body)


def own_profile(token: str, user_id: str) -> dict:
    rows = rest("GET", "profiles", token, f"id=eq.{user_id}&select=account_status,account_status_reason").json()
    return rows[0]


def test_a_pending_dealer_is_refused_through_both_doors_and_an_approved_one_is_not(
    world, api_client, make_actor, fresh_sign_in
):
    pending_id, _, pending = make_actor("dealer")
    approved_id, approved_email, _ = make_actor("dealer")
    decided = decide(api_client, world, approved_id, "approved")
    assert decided.status_code == 200, decided.text
    assert decided.json() == {"role": "dealer", "previous_status": "pending", "new_status": "approved"}
    approved = fresh_sign_in(approved_email)

    # FastAPI: refused for their status, not their role.
    refused = api_client("GET", "/api/v1/dealer/inventory", pending)
    assert refused.status_code == 403, refused.text
    assert refused.json()["code"] == "account_not_approved"
    allowed = api_client("GET", "/api/v1/dealer/inventory", approved)
    assert allowed.status_code == 200, allowed.text

    # PostgREST with the same sessions: row-level security gives the same answer.
    store = rest("POST", "dealer_stores", pending, body={"dealer_id": pending_id, "name": "Pending store"})
    assert refused_by_rls(store), store.text
    store = rest("POST", "dealer_stores", approved, body={"dealer_id": approved_id, "name": "Approved store"})
    assert store.status_code == 201, store.text
    listing = rest("POST", "listings", pending, body={"owner_id": pending_id, "title": "Urea", "price": 50})
    assert refused_by_rls(listing), listing.text

    # What a pending dealer still needs: editing their own profile.
    edited = api_client("PATCH", "/api/v1/profile", pending, json={"city": "Multan"})
    assert edited.status_code == 204, edited.text


def test_a_buyer_cannot_open_a_dealer_store_through_postgrest(world):
    # Before A3a the dealer tables checked only the owner, so any role could create a store for themselves.
    store = rest("POST", "dealer_stores", world.buyer.token, body={"dealer_id": world.buyer.id, "name": "Not mine"})
    assert refused_by_rls(store), store.text


def test_nobody_approves_themselves_and_an_admin_decides_only_with_a_second_factor(
    make_actor, api_client, world, matrix_actors
):
    pending_id, _, pending = make_actor("dealer")
    self_approval = rest("PATCH", "profiles", pending, f"id=eq.{pending_id}", {"account_status": "approved"})
    assert refused_by_rls(self_approval), self_approval.text
    # Not even the admin decides by a direct write: no audit row would follow it.
    direct = rest("PATCH", "profiles", world.admin.token, f"id=eq.{pending_id}", {"account_status": "approved"})
    assert refused_by_rls(direct), direct.text
    no_mfa = api_client(
        "PATCH",
        f"/api/v1/admin/users/{pending_id}/account-status",
        matrix_actors["admin_aal1"],
        json={"status": "approved"},
    )
    assert no_mfa.status_code == 403, no_mfa.text
    assert no_mfa.json()["code"] == "mfa_required"
    via_own_session = api_client(
        "PATCH", f"/api/v1/admin/users/{pending_id}/account-status", pending, json={"status": "approved"}
    )
    assert via_own_session.status_code == 403, via_own_session.text
    assert own_profile(pending, pending_id)["account_status"] == "pending"
    # The allowed path: the admin with a second factor.
    assert decide(api_client, world, pending_id, "approved").status_code == 200


def test_every_decision_is_audited_with_the_srds_event_name(world, api_client, make_actor):
    dealer_id, _, _ = make_actor("dealer")
    assert decide(api_client, world, dealer_id, "rejected", REASON).status_code == 200
    logs = api_client("GET", "/api/v1/admin/audit-logs?target_entity=profiles", world.admin.token)
    assert logs.status_code == 200, logs.text
    entry = next(e for e in logs.json() if e["target_id"] == dealer_id)
    assert entry["action"] == "dealer_application_rejected"
    assert entry["actor_id"] == world.admin.id
    assert entry["previous_state"]["account_status"] == "pending"
    assert entry["new_state"] == {"account_status": "rejected", "account_status_reason": REASON}


def test_only_a_pending_dealer_is_decided_here(world, api_client, make_actor):
    farmer = decide(api_client, world, world.farmer.id, "rejected", REASON)
    assert farmer.status_code == 409, farmer.text
    assert farmer.json()["code"] == "conflict"
    expert = decide(api_client, world, world.expert.id, "rejected", REASON)
    assert expert.status_code == 409, expert.text
    missing = decide(api_client, world, "00000000-0000-4000-8000-000000000000", "approved")
    assert missing.status_code == 404, missing.text
    # An approval is not taken back by a decision: suspension is the tool for that.
    again = decide(api_client, world, world.dealer.id, "rejected", REASON)
    assert again.status_code == 409, again.text
    assert again.json()["code"] == "invalid_transition"
    # A rejection says why (the applicant reads it), on the API and in the database.
    dealer_id, _, _ = make_actor("dealer")
    short = decide(api_client, world, dealer_id, "rejected", "no")
    assert short.status_code == 422, short.text


def test_a_rejected_dealer_reads_the_reason_and_resubmits(world, api_client, make_actor):
    dealer_id, _, token = make_actor("dealer")
    assert decide(api_client, world, dealer_id, "rejected", REASON).status_code == 200
    assert own_profile(token, dealer_id) == {"account_status": "rejected", "account_status_reason": REASON}
    still_refused = api_client("GET", "/api/v1/dealer/inventory", token)
    assert still_refused.json()["code"] == "account_not_approved", still_refused.text
    resubmitted = api_client("POST", "/api/v1/profile/application/resubmit", token)
    assert resubmitted.status_code == 204, resubmitted.text
    assert own_profile(token, dealer_id) == {"account_status": "pending", "account_status_reason": None}
    twice = api_client("POST", "/api/v1/profile/application/resubmit", token)
    assert twice.status_code == 409, twice.text
    assert twice.json()["code"] == "invalid_transition"
    farmer = api_client("POST", "/api/v1/profile/application/resubmit", world.farmer.token)
    assert farmer.status_code == 409, farmer.text


def test_a_session_from_before_the_approval_must_sign_in_again(world, api_client, make_actor, fresh_sign_in):
    dealer_id, dealer_email, old_session = make_actor("dealer")
    # The token's sign-in time (`amr`) is whole seconds, and a sign-in in the decision's own second counts as after
    # it; a real applicant signs in well before an admin decides.
    time.sleep(1.2)
    assert decide(api_client, world, dealer_id, "approved").status_code == 200
    stale = api_client("GET", "/api/v1/dealer/inventory", old_session)
    assert stale.status_code == 403, stale.text
    assert stale.json()["code"] == "sign_in_again"
    fresh = api_client("GET", "/api/v1/dealer/inventory", fresh_sign_in(dealer_email))
    assert fresh.status_code == 200, fresh.text


def test_an_expert_applies_while_pending_and_is_approved_from_approvals(world, api_client, make_actor, fresh_sign_in):
    expert_id, expert_email, token = make_actor("expert")
    # Independent verification F1 of the parked branch: the application row itself must not carry a decision.
    forged = rest("POST", "experts", token, body={"id": expert_id, "verification_status": "approved"})
    assert forged.status_code >= 400, forged.text
    # A pending expert cannot be decided before applying.
    early = api_client(
        "PATCH",
        f"/api/v1/expert/admin/{expert_id}/verification",
        world.admin.token,
        json={"decision": "approved"},
    )
    assert early.status_code == 409, early.text
    applied = api_client(
        "POST",
        "/api/v1/expert/application",
        token,
        json={
            "profile": {
                "qualifications": "MSc Plant Pathology",
                "degree": "MSc",
                "experience": "6 years",
                "professional_description": "Rice diseases",
                "contact": "expert@example.test",
                "specializations": ["plant_diseases"],
            }
        },
    )
    assert applied.status_code in (200, 201), applied.text
    assert api_client("GET", "/api/v1/expert/me", token).status_code == 200
    detail = api_client("GET", f"/api/v1/expert/admin/{expert_id}", world.admin.token)
    assert detail.status_code == 200, detail.text
    assert detail.json()["verification_status"] == "pending"
    inbox = api_client("GET", "/api/v1/consultations/assigned", token)
    assert inbox.json()["code"] == "account_not_approved", inbox.text
    # A buyer cannot file an expert application (no role check on the table before A3a).
    buyer_row = rest("POST", "experts", world.buyer2.token, body={"id": world.buyer2.id})
    assert refused_by_rls(buyer_row), buyer_row.text

    decided = api_client(
        "PATCH",
        f"/api/v1/expert/admin/{expert_id}/verification",
        world.admin.token,
        json={"decision": "approved", "notes": "Degree checked"},
    )
    assert decided.status_code == 204, decided.text
    fresh = fresh_sign_in(expert_email)
    assert api_client("GET", "/api/v1/consultations/assigned", fresh).status_code == 200
    public = api_client("GET", f"/api/v1/expert/{expert_id}")
    assert public.status_code == 200, public.text


def test_a_role_change_resets_the_approval_at_once(world, api_client, make_actor):
    farmer_id, _, token = make_actor("farmer")
    made_dealer = api_client(
        "PATCH", f"/api/v1/admin/users/{farmer_id}/role", world.admin.token, json={"role": "dealer"}
    )
    assert made_dealer.status_code == 204, made_dealer.text
    refused = api_client("GET", "/api/v1/dealer/inventory", token)
    assert refused.status_code == 403, refused.text
    assert refused.json()["code"] == "account_not_approved"


def test_the_pending_dealer_queue_is_filtered_on_the_server(world, api_client, make_actor):
    # The app filtered one page of 100 profiles and lost applicants whose names sorted later (verification round 1, H2).
    dealer_id, _, _ = make_actor("dealer")
    queue = api_client("GET", "/api/v1/admin/users?role=dealer&account_status=pending&limit=100", world.admin.token)
    assert queue.status_code == 200, queue.text
    rows = queue.json()
    assert dealer_id in [row["id"] for row in rows]
    assert all(row["role"] == "dealer" and row["account_status"] == "pending" for row in rows)
    bad = api_client("GET", "/api/v1/admin/users?account_status=maybe", world.admin.token)
    assert bad.status_code == 422, bad.text


def test_the_expert_route_decides_only_experts(world, api_client, make_actor):
    # Each role has one place where it is reviewed (verification round 1, L5).
    dealer_id, _, _ = make_actor("dealer")
    response = api_client(
        "PATCH", f"/api/v1/expert/admin/{dealer_id}/verification", world.admin.token, json={"decision": "approved"}
    )
    assert response.status_code == 409, response.text
    assert response.json()["code"] == "conflict"
