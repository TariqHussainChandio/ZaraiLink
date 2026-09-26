"""
Follow-up to security fix C2, found by this phase's verifier: `disease_images_owner_write`
(20260901080000_disease_images_bucket.sql) checked `owner = auth.uid()`, but Storage auto-sets
`owner` to the uploader regardless of the chosen path — so any authenticated user could write an
object into another user's folder (`<victim-id>/whatever.jpg`). Migration
`20260922080300_disease_images_owner_path_check.sql` adds a folder-ownership check
(`(storage.foldername(name))[1] = auth.uid()::text`), matching the pattern already used for
`message-attachments`/`consultation-attachments`. Not an SSRF or data-exposure regression on its
own (disease_service.create_case's ownership check already stops a planted object from ever being
linked to someone else's case), but this proves the storage layer itself now holds the same
invariant, not just the application layer.

Needs a LOCAL Supabase stack and refuses to run against anything else — see
test_signup_role_escalation.py for the exact setup commands.
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


@pytest.fixture
def two_confirmed_users():
    """Signs up two throwaway users, confirms and logs both in, deletes both afterwards."""
    anon = {"apikey": ANON_KEY, "Authorization": f"Bearer {ANON_KEY}"}
    service = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    users = []

    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        for _ in range(2):
            email = f"storage-test-{uuid.uuid4().hex[:10]}@example.test"
            password = "Passw0rd!123"
            signup = http.post("/auth/v1/signup", headers=anon, json={"email": email, "password": password, "data": {}})
            assert signup.status_code == 200, signup.text
            user_id = signup.json().get("id") or signup.json()["user"]["id"]
            http.put(
                f"/auth/v1/admin/users/{user_id}", headers=service, json={"email_confirm": True}
            ).raise_for_status()
            token = http.post(
                "/auth/v1/token?grant_type=password", headers=anon, json={"email": email, "password": password}
            ).json()["access_token"]
            users.append((user_id, token))

        yield http, users

        for user_id, _ in users:
            http.delete(f"/auth/v1/admin/users/{user_id}", headers=service)


def test_user_can_upload_to_their_own_folder(two_confirmed_users):
    http, ((user_a_id, token_a), _) = two_confirmed_users
    response = http.post(
        f"/storage/v1/object/disease-images/{user_a_id}/leaf.jpg",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token_a}", "Content-Type": "image/jpeg"},
        content=b"fake-jpeg-bytes",
    )
    assert response.status_code in (200, 201), response.text


def test_user_cannot_upload_into_another_users_folder(two_confirmed_users):
    http, ((_user_a_id, token_a), (user_b_id, _)) = two_confirmed_users
    # A tries to plant an object under B's folder — must be rejected by the storage policy itself,
    # independent of anything the backend's create_case ownership check would separately catch.
    response = http.post(
        f"/storage/v1/object/disease-images/{user_b_id}/planted.jpg",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token_a}", "Content-Type": "image/jpeg"},
        content=b"fake-jpeg-bytes",
    )
    assert response.status_code in (400, 403), response.text
