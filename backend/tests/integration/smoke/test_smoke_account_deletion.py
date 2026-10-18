"""P4 (4A.5) smoke matrix — self-service account deletion (`DELETE /api/v1/profile/me`). Proves
the full sequence for real: re-authentication, in-place anonymization, storage cleanup, the audit
log entry, and soft-deleting the auth user without cascading — the actual point of the design
being that a counterparty's existing order/listing survives with the anonymized placeholder
instead of erroring or disappearing.

Uses its own throwaway farmer/buyer, never `world`'s shared actors — deleting one of those would
break every other smoke test file that depends on `world` staying intact for the whole session.

Replaces a throwaway script from the implementation session, promoted here after the two-key
verifier caught it being cited in the standardization plan as if it already existed.
"""

from __future__ import annotations

import io
import os
import uuid

import httpx
from PIL import Image

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")
PASSWORD = "Passw0rd!123"


def _make_user(role: str) -> tuple[str, str, str]:
    email = f"smoke-delete-{role}-{uuid.uuid4().hex[:8]}@example.test"
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
        return user_id, email, token_resp.json()["access_token"]


def test_account_deletion_anonymizes_profile_and_a_counterpartys_order_still_renders(api_client):
    farmer_id, farmer_email, farmer_token = _make_user("farmer")
    _, _, buyer_token = _make_user("buyer")

    # Farmer uploads an avatar — proves the storage sweep, not just the profile row.
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), (20, 120, 20)).save(buf, format="JPEG")
    avatar_path = f"{farmer_id}/avatar-smoke.jpg"
    upload = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/avatars/{avatar_path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {farmer_token}", "Content-Type": "image/jpeg"},
        content=buf.getvalue(),
        timeout=30,
    )
    assert upload.status_code in (200, 201), upload.text

    # B5: a file in the owner's folder of the inventory exports bucket. Only the API writes there (service role, under
    # the verified caller's id), so it is placed the same way; a deleted account's report files must go with it.
    export_path = f"{farmer_id}/stock-summary-smoke.csv"
    planted = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/inventory-exports/{export_path}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "text/csv"},
        content=b"product_id,sku",
        timeout=30,
    )
    assert planted.status_code in (200, 201), planted.text

    # Farmer sells something to buyer, so there's a real cross-user record to check afterwards.
    categories = api_client("GET", "/api/v1/marketplace/categories", buyer_token)
    category_id = categories.json()[0]["id"]
    listing = api_client(
        "POST",
        "/api/v1/marketplace/listings",
        farmer_token,
        json={
            "title": "Smoke deletion wheat",
            "price": 10.0,
            "unit": "kg",
            "quantity": 50,
            "category_id": category_id,
            "description": "d",
        },
    )
    assert listing.status_code in (200, 201), listing.text
    listing_id = listing.json()["id"]

    checkout = api_client(
        "POST", "/api/v1/orders/checkout", buyer_token, json={"cart_items": [{"listing_id": listing_id, "quantity": 2}]}
    )
    assert checkout.status_code in (200, 201), checkout.text
    orders = checkout.json()
    order_id = (orders[0] if isinstance(orders, list) else orders)["id"]

    # Wrong password is rejected, and doesn't touch the account.
    wrong = api_client("DELETE", "/api/v1/profile/me", farmer_token, json={"password": "not-the-real-password"})
    assert wrong.status_code == 401, wrong.text

    # Correct password deletes.
    correct = api_client("DELETE", "/api/v1/profile/me", farmer_token, json={"password": PASSWORD})
    assert correct.status_code == 204, correct.text

    # The account can no longer sign in.
    resignin = httpx.post(
        f"{LOCAL_URL}/auth/v1/token?grant_type=password",
        headers={"apikey": ANON_KEY},
        json={"email": farmer_email, "password": PASSWORD},
        timeout=30,
    )
    assert resignin.status_code != 200, resignin.text

    # The actual point of should_soft_delete=True: the buyer's order still exists and renders,
    # with the seller anonymized — not a 404, not a null seller.
    order_detail = api_client("GET", f"/api/v1/orders/{order_id}", buyer_token)
    assert order_detail.status_code == 200, order_detail.text
    assert order_detail.json()["seller"]["full_name"] == "Deleted user"

    # The avatar object was swept.
    listed = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/list/avatars",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        json={"prefix": f"{farmer_id}/"},
        timeout=30,
    )
    assert listed.json() == [], listed.text
    listed_exports = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/list/inventory-exports",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        json={"prefix": f"{farmer_id}/"},
        timeout=30,
    )
    assert listed_exports.json() == [], listed_exports.text

    # The audit log entry was written (service-role insert, since this isn't an admin action —
    # 20260924080000_account_deletion_audit_grant.sql).
    audit = httpx.get(
        f"{LOCAL_URL}/rest/v1/audit_logs?actor_id=eq.{farmer_id}&action=eq.account_self_deleted",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        timeout=30,
    )
    assert len(audit.json()) == 1, audit.text
