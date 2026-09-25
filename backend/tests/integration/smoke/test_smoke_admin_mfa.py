"""P4 (4A.4) smoke matrix — admin MFA (TOTP). Proves both enforcement layers for real: FastAPI's
`require_admin_aal2` dependency (used by the 7 admin write endpoints) and the matching RLS-level
`is_admin_aal2()` checks (20260924080100_admin_mfa_enforcement.sql) — an aal1 admin session is
rejected by both, an aal2 session (after a real TOTP enrol + challenge + verify round trip against
the local Supabase Auth API) is accepted by both.

Enrolment itself goes straight through Supabase Auth's REST API, not FastAPI — matching this
codebase's existing pattern (every other auth operation: signup, signin, OTP, password reset)
where the mobile app talks to Supabase directly and FastAPI only ever consumes the resulting JWT.
"""

from __future__ import annotations

import os
import subprocess
import uuid

import httpx
import pyotp

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")
PASSWORD = "Passw0rd!123"


def _local_db_container() -> str:
    names = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, check=True
    ).stdout.split()
    return next(n for n in names if n.startswith("supabase_db_"))


def _promote_to_admin(user_id: str) -> None:
    """See docs/process/admin-bootstrap-runbook.md for why this needs the trigger bypass rather
    than a plain UPDATE."""
    sql = (
        "begin; set local session_replication_role = replica; "
        f"update public.profiles set role = 'admin' where id = '{user_id}'; commit;"
    )
    subprocess.run(
        ["docker", "exec", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )


def _make_user(role: str) -> tuple[str, str]:
    email = f"smoke-mfa-{role}-{uuid.uuid4().hex[:8]}@example.test"
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        created = http.post(
            "/auth/v1/admin/users",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            json={"email": email, "password": PASSWORD, "email_confirm": True, "user_metadata": {"role": role}},
        )
        created.raise_for_status()
        user_id = created.json()["id"]
        token_resp = http.post(
            "/auth/v1/token?grant_type=password",
            headers={"apikey": ANON_KEY},
            json={"email": email, "password": PASSWORD},
        )
        token_resp.raise_for_status()
        return user_id, token_resp.json()["access_token"]


def _enrol_totp_and_get_aal2_token(aal1_token: str) -> str:
    """Drives the same 3-call sequence a mobile TOTP-enrolment screen would: enrol -> challenge ->
    verify. `pyotp` stands in for the user's authenticator app, computing a code from the same
    secret the enrol response hands back."""
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        enroll = http.post(
            "/auth/v1/factors",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {aal1_token}"},
            json={"factor_type": "totp"},
        )
        enroll.raise_for_status()
        factor = enroll.json()
        factor_id = factor["id"]
        secret = factor["totp"]["secret"]

        challenge = http.post(
            f"/auth/v1/factors/{factor_id}/challenge",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {aal1_token}"},
        )
        challenge.raise_for_status()
        challenge_id = challenge.json()["id"]

        verify = http.post(
            f"/auth/v1/factors/{factor_id}/verify",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {aal1_token}"},
            json={"challenge_id": challenge_id, "code": pyotp.TOTP(secret).now()},
        )
        verify.raise_for_status()
        return verify.json()["access_token"]


def test_admin_write_rejected_without_mfa_then_allowed_after_totp_enrolment(api_client):
    admin_id, aal1_token = _make_user("buyer")
    _promote_to_admin(admin_id)
    target_id, _ = _make_user("buyer")

    without_mfa = api_client(
        "PATCH", f"/api/v1/admin/users/{target_id}/suspend", aal1_token, json={"is_suspended": True}
    )
    assert without_mfa.status_code == 403, without_mfa.text

    aal2_token = _enrol_totp_and_get_aal2_token(aal1_token)

    with_mfa = api_client("PATCH", f"/api/v1/admin/users/{target_id}/suspend", aal2_token, json={"is_suspended": True})
    assert with_mfa.status_code == 204, with_mfa.text


def test_rls_layer_also_enforces_aal2_independent_of_fastapi(backend_url):
    """Defense in depth: bypass FastAPI entirely and hit PostgREST directly with an aal1 admin
    session — the database itself must still refuse the write. Takes `backend_url` only to
    inherit its local-stack skip guard (this test itself never calls the backend)."""
    admin_id, aal1_token = _make_user("buyer")
    _promote_to_admin(admin_id)

    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        report = http.post(
            "/rest/v1/reports",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {aal1_token}", "Prefer": "return=representation"},
            json={"reporter_id": admin_id, "target_type": "listing", "target_id": admin_id, "reason": "smoke test"},
        )
        report.raise_for_status()
        report_id = report.json()[0]["id"]

        denied = http.patch(
            f"/rest/v1/reports?id=eq.{report_id}",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {aal1_token}", "Prefer": "return=representation"},
            json={"status": "resolved"},
        )
        # RLS silently filters the row out of an unauthorized update rather than erroring — 200
        # with an empty list means "zero rows matched the policy", i.e. correctly denied.
        assert denied.status_code == 200, denied.text
        assert denied.json() == []

        aal2_token = _enrol_totp_and_get_aal2_token(aal1_token)
        allowed = http.patch(
            f"/rest/v1/reports?id=eq.{report_id}",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {aal2_token}", "Prefer": "return=representation"},
            json={"status": "resolved"},
        )
        assert allowed.status_code == 200, allowed.text
        assert allowed.json()[0]["status"] == "resolved"
