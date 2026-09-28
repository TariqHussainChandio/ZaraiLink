"""P5a smoke matrix — admin domain."""

from __future__ import annotations

import os
import uuid

import httpx

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")


def _make_throwaway_user() -> str:
    """A user this file can safely mutate (e.g. change role) without disturbing world's shared
    actors, which other smoke test files rely on staying in their original role. Duplicated,
    minimal signup logic rather than importing conftest.py's make_user() — this directory
    deliberately has no __init__.py (matching every other tests/ subdirectory), so a relative
    import isn't available outside of pytest's own fixture auto-discovery."""
    email = f"smoke-throwaway-{uuid.uuid4().hex[:8]}@example.test"
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        created = http.post(
            "/auth/v1/admin/users",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            json={
                "email": email,
                "password": "Passw0rd!123",
                "email_confirm": True,
                "user_metadata": {"role": "buyer"},
            },
        )
        created.raise_for_status()
        return created.json()["id"]


def _sign_in_throwaway(user_id: str) -> str:
    """Access token for a user made by _make_throwaway_user (known password)."""
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        headers = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
        email = http.get(f"/auth/v1/admin/users/{user_id}", headers=headers).json()["email"]
        login = http.post(
            "/auth/v1/token?grant_type=password",
            headers={"apikey": ANON_KEY},
            json={"email": email, "password": "Passw0rd!123"},
        )
        login.raise_for_status()
        return login.json()["access_token"]


def test_platform_stats(world, api_client):
    response = api_client("GET", "/api/v1/admin/stats", world.admin.token)
    assert response.status_code == 200, response.text
    assert "total_users" in response.json()


def test_list_users(world, api_client, find_profile):
    assert api_client("GET", "/api/v1/admin/users", world.admin.token).status_code == 200
    assert find_profile(world.farmer.id) is not None


def test_suspend_and_unsuspend_a_user(world, api_client):
    # A throwaway user, not world.buyer2: the backend caches role/suspension for 10 s per user
    # (auth/dependencies.py), so a shared actor suspended here would still read as suspended for later test
    # files that run within that window — which only became visible once the suite got fast enough.
    target_id = _make_throwaway_user()
    target_token = _sign_in_throwaway(target_id)

    suspend = api_client(
        "PATCH", f"/api/v1/admin/users/{target_id}/suspend", world.admin.token, json={"is_suspended": True}
    )
    assert suspend.status_code == 204, suspend.text

    blocked = api_client("GET", "/api/v1/orders", target_token)
    assert blocked.status_code == 403, blocked.text

    unsuspend = api_client(
        "PATCH", f"/api/v1/admin/users/{target_id}/suspend", world.admin.token, json={"is_suspended": False}
    )
    assert unsuspend.status_code == 204, unsuspend.text


def test_non_admin_cannot_suspend(world, api_client):
    response = api_client(
        "PATCH", f"/api/v1/admin/users/{world.buyer2.id}/suspend", world.buyer.token, json={"is_suspended": True}
    )
    assert response.status_code == 403


def test_change_user_role(world, api_client):
    target_id = _make_throwaway_user()
    response = api_client("PATCH", f"/api/v1/admin/users/{target_id}/role", world.admin.token, json={"role": "expert"})
    assert response.status_code == 204, response.text


def test_reports_list_is_readable(world, api_client):
    response = api_client("GET", "/api/v1/admin/reports", world.admin.token)
    assert response.status_code == 200, response.text


def test_audit_log_records_the_suspend_action(world, api_client):
    response = api_client("GET", "/api/v1/admin/audit-logs", world.admin.token)
    assert response.status_code == 200, response.text
    # BR-15: every admin action is audit-logged. The suspend/unsuspend pair above must show up.
    actions = [entry["action"] for entry in response.json()]
    assert any("suspend" in action for action in actions), actions


def test_admin_orders_view(world, api_client):
    response = api_client("GET", "/api/v1/admin/orders", world.admin.token)
    assert response.status_code == 200, response.text
