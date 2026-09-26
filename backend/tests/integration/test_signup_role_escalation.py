"""
Security fix C1 (standardization plan P3, docs/process/standardization-plan.md §1.2): a public
sign-up must never be able to create an admin.

`handle_new_user()` used to cast `raw_user_meta_data->>'role'` straight into the `user_role`
enum, which includes `admin` — anyone holding the public anon key could call the Auth API with
`{"data": {"role": "admin"}}` and receive an admin profile. Confirmed end to end in the P0
baseline (docs/status/baseline-2026-09.md): that session was then accepted by
`GET /api/v1/admin/stats`. This was `xfail(strict=True)` from P0 until the fix landed
(migration 20260922080000_role_escalation_fix.sql, an allow-list of the four self-selectable
roles); the marker is gone now that it passes for real.

Needs a LOCAL Supabase stack and refuses to run against anything else:

    npx supabase start
    export LOCAL_SUPABASE_URL=http://127.0.0.1:54321
    export LOCAL_SUPABASE_ANON_KEY=<ANON_KEY printed by `supabase start`>
    export LOCAL_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY printed by `supabase start`>
    python -m pytest tests/integration/test_signup_role_escalation.py -rxs

Every user this file creates lives only in that disposable local database and is deleted
afterwards.
"""

import os
import uuid

import httpx
import pytest

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")

_is_local = LOCAL_URL.startswith(("http://127.0.0.1", "http://localhost"))

pytestmark = pytest.mark.skipif(
    not (_is_local and ANON_KEY and SERVICE_KEY),
    reason="needs a local Supabase stack (supabase start) and LOCAL_SUPABASE_URL / "
    "LOCAL_SUPABASE_ANON_KEY / LOCAL_SUPABASE_SERVICE_ROLE_KEY; never point this at a hosted project",
)


def _signup_and_read_back_role(requested_role: str | None) -> str:
    """Signs up a throwaway user (optionally requesting `requested_role` in the signup metadata,
    matching exactly what a malicious or a normal client sends), confirms the account, logs in,
    and returns the role Postgres actually stored for it. Deletes the user afterwards regardless
    of outcome."""
    email = f"role-test-{uuid.uuid4().hex[:10]}@example.test"
    password = "Passw0rd!123"
    anon = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    service = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    data = {"full_name": "Baseline"}
    if requested_role is not None:
        data["role"] = requested_role

    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        signup = http.post(
            "/auth/v1/signup",
            headers=anon,
            json={"email": email, "password": password, "data": data},
        )
        assert signup.status_code == 200, signup.text
        body = signup.json()
        user_id = body.get("id") or body["user"]["id"]
        try:
            # Email delivery is not what is under test, so confirm through the admin API.
            http.put(
                f"/auth/v1/admin/users/{user_id}", headers=service, json={"email_confirm": True}
            ).raise_for_status()
            token = http.post(
                "/auth/v1/token?grant_type=password", headers=anon, json={"email": email, "password": password}
            ).json()["access_token"]
            profile = http.get(
                "/rest/v1/profiles",
                params={"id": f"eq.{user_id}", "select": "role"},
                headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
            ).json()
        finally:
            http.delete(f"/auth/v1/admin/users/{user_id}", headers=service)

    return profile[0]["role"]


def test_public_signup_cannot_self_assign_the_admin_role():
    assert _signup_and_read_back_role("admin") != "admin"


@pytest.mark.parametrize("role", ["farmer", "buyer", "dealer", "expert"])
def test_public_signup_still_gets_the_role_it_legitimately_requested(role):
    # Regression guard: the C1 fix allow-lists these four roles rather than blocking role
    # selection entirely — a farmer signing up as 'farmer' must still get 'farmer', not silently
    # fall back to 'buyer'.
    assert _signup_and_read_back_role(role) == role


def test_a_garbage_role_string_falls_back_to_buyer_without_crashing_signup():
    # Before the fix, an invalid enum value raised a Postgres cast error and signup itself
    # failed outright; the fix's CASE/text-compare avoids the cast entirely for anything not on
    # the allow-list, so this must now succeed and land as the safe default.
    assert _signup_and_read_back_role("not-a-real-role") == "buyer"


def test_omitting_role_entirely_still_defaults_to_buyer():
    assert _signup_and_read_back_role(None) == "buyer"
