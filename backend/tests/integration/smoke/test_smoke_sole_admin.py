"""D19 on the real stack: the admin is the platform's one administrator and needs no second factor; two-step
verification stays optional for everyone else.

Two-user proofs, each through FastAPI and again straight through PostgREST (the database's own policies and
guard_profiles_role, 20261120080000_sole_admin_no_mfa.sql), so neither layer can be weakened without one of these
failing:
- the admin's write works on a password-only (aal1) session; a farmer's same write is refused;
- nobody is made an admin, and the admin's role, suspension and details are fixed;
- the admin account cannot be deleted;
- a farmer may turn on two-step verification, and a session that used it is aal2 (the app then asks for the code at
  sign-in); a farmer without it signs in with the password alone.
"""

from __future__ import annotations

import base64
import json
import os

import httpx
import pyotp

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")


def _claims(token: str) -> dict:
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def _rest(method: str, path: str, token: str, **kw) -> httpx.Response:
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Prefer": "return=representation"}
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        return http.request(method, f"/rest/v1{path}", headers=headers, **kw)


def test_the_admin_writes_without_a_second_factor_and_a_farmer_does_not(world, api_client, make_actor):
    target_id, _, _ = make_actor("buyer")
    assert _claims(world.admin.token)["aal"] == "aal1", "the admin's session must be password-only for this proof"

    by_farmer = api_client("PATCH", f"/api/v1/admin/users/{target_id}/suspend", world.farmer.token, json={"is_suspended": True})
    assert by_farmer.status_code == 403, by_farmer.text
    assert by_farmer.json()["code"] == "insufficient_role"

    by_admin = api_client("PATCH", f"/api/v1/admin/users/{target_id}/suspend", world.admin.token, json={"is_suspended": True})
    assert by_admin.status_code == 204, by_admin.text
    restored = api_client("PATCH", f"/api/v1/admin/users/{target_id}/suspend", world.admin.token, json={"is_suspended": False})
    assert restored.status_code == 204, restored.text


def test_the_database_admits_the_admin_at_aal1_and_refuses_a_farmer(world, backend_url):
    """Straight through PostgREST: the policies themselves (is_admin_aal2() is now is_admin()). Takes `backend_url`
    only for its local-stack skip guard."""
    report = _rest(
        "POST",
        "/reports",
        world.buyer.token,
        json={"reporter_id": world.buyer.id, "target_type": "listing", "target_id": world.farmer_listing_id, "reason": "smoke D19"},
    )
    assert report.status_code == 201, report.text
    report_id = report.json()[0]["id"]

    # RLS filters a refused update to zero rows rather than erroring.
    by_farmer = _rest("PATCH", f"/reports?id=eq.{report_id}", world.farmer.token, json={"status": "investigating"})
    assert by_farmer.status_code == 200, by_farmer.text
    assert by_farmer.json() == []

    by_admin = _rest("PATCH", f"/reports?id=eq.{report_id}", world.admin.token, json={"status": "investigating"})
    assert by_admin.status_code == 200, by_admin.text
    assert by_admin.json()[0]["status"] == "investigating"


def test_nobody_is_made_an_admin(world, api_client, make_actor):
    target_id, _, target_token = make_actor("buyer")

    through_api = api_client("PATCH", f"/api/v1/admin/users/{target_id}/role", world.admin.token, json={"role": "admin"})
    assert through_api.status_code == 422, through_api.text

    by_admin = _rest("PATCH", f"/profiles?id=eq.{target_id}", world.admin.token, json={"role": "admin"})
    assert by_admin.status_code == 403, by_admin.text
    by_self = _rest("PATCH", f"/profiles?id=eq.{target_id}", target_token, json={"role": "admin"})
    assert by_self.status_code == 403, by_self.text


def test_the_admin_accounts_role_access_and_details_are_fixed(world, api_client):
    role = api_client("PATCH", f"/api/v1/admin/users/{world.admin.id}/role", world.admin.token, json={"role": "buyer"})
    assert role.status_code == 409, role.text
    suspend = api_client("PATCH", f"/api/v1/admin/users/{world.admin.id}/suspend", world.admin.token, json={"is_suspended": True})
    assert suspend.status_code == 409, suspend.text
    details = api_client("PATCH", "/api/v1/profile", world.admin.token, json={"phone": "+923001234567", "street": "Mall Road"})
    assert details.status_code == 403, details.text

    # The database refuses the same, past FastAPI.
    for patch in ({"role": "buyer"}, {"is_suspended": True}, {"phone": "+923001234567"}, {"full_name": "Someone else"}):
        direct = _rest("PATCH", f"/profiles?id=eq.{world.admin.id}", world.admin.token, json=patch)
        assert direct.status_code == 403, (patch, direct.text)

    # A farmer still edits their own details (the second user of the proof).
    own = api_client("PATCH", "/api/v1/profile", world.farmer.token, json={"street": "Canal Road"})
    assert own.status_code == 204, own.text


def test_the_admin_account_cannot_be_deleted(world, api_client):
    response = api_client("DELETE", "/api/v1/profile/me", world.admin.token, json={"password": "Passw0rd!123"})
    assert response.status_code == 403, response.text
    still_admin = api_client("GET", "/api/v1/admin/stats", world.admin.token)
    assert still_admin.status_code == 200, still_admin.text


def test_two_step_verification_is_optional_for_a_farmer(make_actor, fresh_sign_in, backend_url):
    """A farmer may turn it on (the app's Two-step verification row); a session that used it is aal2. A farmer who
    never turns it on signs in with the password alone. Takes `backend_url` only for its local-stack skip guard."""
    _, plain_email, plain_token = make_actor("farmer")
    assert _claims(plain_token)["aal"] == "aal1"
    assert _claims(fresh_sign_in(plain_email))["aal"] == "aal1"

    _, email, token = make_actor("farmer")
    auth = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        enrolled = http.post("/auth/v1/factors", headers=auth, json={"factor_type": "totp"})
        assert enrolled.status_code == 200, enrolled.text
        factor_id, secret = enrolled.json()["id"], enrolled.json()["totp"]["secret"]
        challenge = http.post(f"/auth/v1/factors/{factor_id}/challenge", headers=auth)
        assert challenge.status_code == 200, challenge.text
        verified = http.post(
            f"/auth/v1/factors/{factor_id}/verify",
            headers=auth,
            json={"challenge_id": challenge.json()["id"], "code": pyotp.TOTP(secret).now()},
        )
        assert verified.status_code == 200, verified.text
    assert _claims(verified.json()["access_token"])["aal"] == "aal2"
    # The next password sign-in is aal1 with a factor waiting: the app shows the code screen (authStore).
    assert _claims(fresh_sign_in(email))["aal"] == "aal1"
