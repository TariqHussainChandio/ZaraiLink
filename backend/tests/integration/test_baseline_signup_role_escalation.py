"""
P0 baseline (expected failure): a public sign-up must never be able to create an admin.

Finding C1 in the standardization plan: `handle_new_user()` (supabase/migrations/
20260820000000_core_schema.sql) copies `raw_user_meta_data->>'role'` into `profiles.role`, the
`user_role` enum contains `admin`, and `guard_profiles_role` only fires on UPDATE. So anyone who
holds the public anon key can call the Auth API with `{"data": {"role": "admin"}}` and receive an
admin profile. Observed in P0: that session was then accepted by `GET /api/v1/admin/stats`.

This test asserts the CORRECT behaviour, so today it fails. `strict=True` turns the fix (plan phase
P3) into a red build until this marker is removed.

It needs a LOCAL Supabase stack and refuses to run against anything else:

    npx supabase start
    export LOCAL_SUPABASE_URL=http://127.0.0.1:54321
    export LOCAL_SUPABASE_ANON_KEY=<ANON_KEY printed by `supabase start`>
    export LOCAL_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY printed by `supabase start`>
    python -m pytest tests/integration/test_baseline_signup_role_escalation.py -rxs

The user it creates lives only in that disposable local database and is deleted afterwards.
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


@pytest.mark.xfail(
    strict=True,
    reason="C1 (plan phase P3): handle_new_user() trusts the client-supplied role. "
    "Remove this marker when sign-up ignores or allow-lists the role.",
)
def test_public_signup_cannot_self_assign_the_admin_role():
    email = f"baseline-{uuid.uuid4().hex[:10]}@example.test"
    password = "Passw0rd!123"
    anon = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    service = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}

    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        signup = http.post(
            "/auth/v1/signup",
            headers=anon,
            json={"email": email, "password": password, "data": {"role": "admin", "full_name": "Baseline"}},
        )
        assert signup.status_code == 200
        body = signup.json()
        user_id = body.get("id") or body["user"]["id"]
        try:
            # Email delivery is not what is under test, so confirm through the admin API.
            http.put(f"/auth/v1/admin/users/{user_id}", headers=service, json={"email_confirm": True}).raise_for_status()
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

    assert profile[0]["role"] != "admin"
