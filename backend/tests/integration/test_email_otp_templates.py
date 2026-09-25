"""
P4 (4A.1), finding A2 ("email carries a link, not a code"): `supabase/templates/confirmation.html`
and `recovery.html` show `{{ .Token }}` — a 6-digit code — instead of Supabase's default
confirmation link. The templates existed from an earlier session but their `config.toml` entries
were left commented out, so they were never actually active; this session enabled them and this
test is the permanent proof they work, replacing a throwaway script the two-key verifier caught
being cited as if it already existed.

Needs a LOCAL Supabase stack (Mailpit is what makes this provable without a real mailbox) and
refuses to run against anything else:

    npx supabase start
    export LOCAL_SUPABASE_URL=http://127.0.0.1:54321
    export LOCAL_SUPABASE_ANON_KEY=<ANON_KEY printed by `supabase start`>
    export LOCAL_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY printed by `supabase start`>
    export LOCAL_MAILPIT_URL=http://127.0.0.1:54324
    python -m pytest tests/integration/test_email_otp_templates.py -rxs
"""

import os
import re
import time
import uuid

import httpx
import pytest

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")
MAILPIT_URL = os.environ.get("LOCAL_MAILPIT_URL", "http://127.0.0.1:54324")

_is_local = LOCAL_URL.startswith(("http://127.0.0.1", "http://localhost"))

pytestmark = pytest.mark.skipif(
    not (_is_local and ANON_KEY and SERVICE_KEY),
    reason="needs a local Supabase stack (supabase start) and LOCAL_SUPABASE_URL / "
    "LOCAL_SUPABASE_ANON_KEY / LOCAL_SUPABASE_SERVICE_ROLE_KEY; never point this at a hosted project",
)


def _latest_email_body(mailpit: httpx.Client, address: str) -> str:
    """Polls Mailpit's own message list for the most recent email to `address` — the send is
    already complete by the time the API call that triggered it returns, but Mailpit's own
    indexing lags by a beat, hence the short retry loop rather than a single read."""
    for _ in range(20):
        listing = mailpit.get("/api/v1/messages", params={"limit": 20})
        listing.raise_for_status()
        for msg in listing.json()["messages"]:
            if any(address in to["Address"] for to in msg["To"]):
                full = mailpit.get(f"/api/v1/message/{msg['ID']}").json()
                return full.get("Text") or full.get("HTML") or ""
        time.sleep(0.5)
    raise TimeoutError(f"no email arrived for {address}")


def _extract_six_digit_code(body: str) -> str:
    match = re.search(r"\b(\d{6})\b", body)
    assert match, f"no 6-digit code found in email body:\n{body}"
    return match.group(1)


def test_signup_confirmation_email_is_a_code_not_a_link():
    email = f"otp-template-signup-{uuid.uuid4().hex[:8]}@example.test"
    password = "Passw0rd!123"

    with (
        httpx.Client(base_url=LOCAL_URL, timeout=30) as auth,
        httpx.Client(base_url=MAILPIT_URL, timeout=30) as mailpit,
    ):
        signup = auth.post("/auth/v1/signup", headers={"apikey": ANON_KEY}, json={"email": email, "password": password})
        assert signup.status_code == 200, signup.text

        body = _latest_email_body(mailpit, email)
        # The default Supabase template links to `{{ .ConfirmationURL }}` — asserting there's no
        # URL in the body is the actual regression guard for "shows a code, not a link" (A2).
        assert "http://" not in body, f"email still contains a link:\n{body}"
        assert "https://" not in body, f"email still contains a link:\n{body}"
        code = _extract_six_digit_code(body)

        verify = auth.post(
            "/auth/v1/verify", headers={"apikey": ANON_KEY}, json={"type": "signup", "email": email, "token": code}
        )
        assert verify.status_code == 200, verify.text
        assert "access_token" in verify.json()


def test_recovery_email_is_a_code_not_a_link_and_the_code_expires_in_15_minutes_not_1_hour():
    # A real, previously-shipped inconsistency this test guards against: the recovery/confirmation
    # templates' own copy said "expires in 1 hour" while `otp_expiry` (shared by every email OTP
    # type) was tightened to 900s (15 min) — the templates were never updated to match. Asserting
    # the displayed copy here, not just that a code exists, catches that class of drift again.
    email = f"otp-template-recovery-{uuid.uuid4().hex[:8]}@example.test"
    password = "Passw0rd!123"

    with (
        httpx.Client(base_url=LOCAL_URL, timeout=30) as auth,
        httpx.Client(base_url=MAILPIT_URL, timeout=30) as mailpit,
    ):
        created = auth.post(
            "/auth/v1/admin/users",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            json={"email": email, "password": password, "email_confirm": True},
        )
        assert created.status_code == 200, created.text

        recover = auth.post("/auth/v1/recover", headers={"apikey": ANON_KEY}, json={"email": email})
        assert recover.status_code == 200, recover.text

        body = _latest_email_body(mailpit, email)
        assert "http://" not in body, f"email still contains a link:\n{body}"
        assert "https://" not in body, f"email still contains a link:\n{body}"
        assert "15 minutes" in body, f"template copy doesn't match the real otp_expiry:\n{body}"
        code = _extract_six_digit_code(body)

        verify = auth.post(
            "/auth/v1/verify", headers={"apikey": ANON_KEY}, json={"type": "recovery", "email": email, "token": code}
        )
        assert verify.status_code == 200, verify.text
        assert "access_token" in verify.json(), "recovery verify did not return a session"
