"""
P5a smoke matrix — core business flows, promoted from docs/status/evidence/p0_core_reality.py
(P0's own runtime-proof script) into real pytest assertions. Where P0 logged a verdict, this
asserts it — a regression here fails CI instead of needing a human to re-run the script and read
the log. Covers marketplace, orders/checkout (BR-09), payments, reviews, dealer inventory
(atomic stock / oversell rejection, BR-03/04), the disease pipeline (now unblocked by the N3
grants migration), and authorization/suspension spot checks.
"""

from __future__ import annotations

import io
import os

import httpx
from PIL import Image

# No import of conftest.py (this directory deliberately has no __init__.py, matching every other
# tests/ subdirectory, so a relative import isn't available) — pytest auto-discovers its `world`/
# `api_client` fixtures by name regardless, without needing an import. ANON_KEY/LOCAL_URL are read
# the same way every other real-stack test in this suite reads them.
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")


def test_farmer_creates_listing_and_buyer_sees_it_in_browse(world, api_client):
    listings = api_client("GET", "/api/v1/marketplace/listings", world.buyer.token)
    assert listings.status_code == 200
    ids = [item["id"] for item in listings.json()]
    assert world.farmer_listing_id in ids


def test_checkout_with_delivery_charge_and_br09_total_split(world, api_client):
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={
            "cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 4}],
            "delivery_charge_by_seller": {world.farmer.id: 150},
        },
    )
    assert checkout.status_code in (200, 201), checkout.text
    orders = checkout.json()
    order = orders[0] if isinstance(orders, list) else orders
    order_id = order["id"]

    detail = api_client("GET", f"/api/v1/orders/{order_id}", world.buyer.token).json()
    subtotal = float(detail["product_subtotal"])
    delivery = float(detail["delivery_charge"])
    total = float(detail["total"])
    # BR-09: delivery charge is always its own line, never folded into the product price.
    assert abs(subtotal + delivery - total) < 0.01, detail

    world.extra["order_id"] = order_id


def test_order_lifecycle_pending_to_completed(world, api_client):
    order_id = world.extra["order_id"]
    for to_status in ("confirmed", "processing", "ready", "completed"):
        response = api_client("PATCH", f"/api/v1/orders/{order_id}/status", world.farmer.token, json={"to": to_status})
        assert response.status_code == 204, f"{to_status}: {response.text}"


def test_payment_initiated_and_marked_received(world, api_client):
    # An order can only be paid while it is open, so this pays a fresh one (the shared order is already completed).
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    payment = api_client("POST", "/api/v1/payments", world.buyer.token, json={"order_id": order_id, "method": "cod"})
    assert payment.status_code in (200, 201), payment.text
    payment_id = payment.json()["id"]

    received = api_client("PATCH", f"/api/v1/payments/{payment_id}/received", world.farmer.token)
    assert received.status_code == 200, received.text

    # a payment that is already decided cannot be decided again, and a completed order cannot be paid
    assert (
        api_client(
            "PATCH", f"/api/v1/payments/{payment_id}/failed", world.farmer.token, json={"reason": None}
        ).status_code
        == 409
    )
    assert api_client("PATCH", f"/api/v1/payments/{payment_id}/received", world.farmer.token).status_code == 409
    assert api_client("PATCH", f"/api/v1/payments/{payment_id}/received", world.admin.token).status_code == 403
    completed = world.extra["order_id"]
    late = api_client("POST", "/api/v1/payments", world.buyer.token, json={"order_id": completed, "method": "cod"})
    assert late.status_code == 409


def test_buyer_reviews_completed_order(world, api_client):
    order_id = world.extra["order_id"]
    review = api_client(
        "POST", "/api/v1/reviews", world.buyer.token, json={"order_id": order_id, "rating": 5, "comment": "smoke test"}
    )
    assert review.status_code in (200, 201), review.text


def test_dealer_oversell_rejected_and_stock_stays_atomic(world, api_client):
    # Two buyers race the same 20-unit inventory row, each wanting 15 — only one can win.
    first = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.dealer_listing_id, "quantity": 15}]},
    )
    second = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer2.token,
        json={"cart_items": [{"listing_id": world.dealer_listing_id, "quantity": 15}]},
    )
    assert first.status_code in (200, 201), first.text
    assert second.status_code in (200, 201), second.text
    first_order = (first.json()[0] if isinstance(first.json(), list) else first.json())["id"]
    second_order = (second.json()[0] if isinstance(second.json(), list) else second.json())["id"]

    confirm_first = api_client(
        "PATCH", f"/api/v1/orders/{first_order}/status", world.dealer.token, json={"to": "confirmed"}
    )
    confirm_second = api_client(
        "PATCH", f"/api/v1/orders/{second_order}/status", world.dealer.token, json={"to": "confirmed"}
    )
    assert confirm_first.status_code == 204, confirm_first.text
    # BR-03/04: the second confirm oversells (20 in stock, 15 already taken) — must be rejected,
    # not silently allowed to go negative.
    assert confirm_second.status_code >= 400, confirm_second.text

    inventory = api_client("GET", f"/api/v1/dealer/inventory/{world.dealer_inventory_id}", world.dealer.token)
    assert inventory.status_code == 200
    assert inventory.json()["stock_quantity"] == 5  # 20 - 15, the second confirm never touched it


def test_disease_pipeline_end_to_end_on_a_database_built_only_from_migrations(world, api_client):
    """The concrete N3 exit bar: create_case + predict must work with zero manual grants — only
    the 20260923080000_service_role_disease_grants.sql migration, applied by `supabase db reset`
    like every other migration."""
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), (34, 110, 44)).save(buf, format="JPEG")

    path = f"{world.buyer.id}/smoke-leaf.jpg"
    upload = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/disease-images/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {world.buyer.token}", "Content-Type": "image/jpeg"},
        content=buf.getvalue(),
        timeout=30,
    )
    assert upload.status_code in (200, 201), upload.text

    case = api_client("POST", "/api/v1/disease/cases", world.buyer.token, json={"storage_path": path})
    assert case.status_code == 200, case.text
    assert "image_signed_url" in case.json()

    predict = api_client(
        "POST", "/api/v1/disease/predict", world.buyer.token, json={"disease_case_id": case.json()["id"]}
    )
    # 200 if a real model.pth is loaded, 503 only if the checkpoint itself is unavailable — either
    # way, N3's privilege gap must not be why this fails (that would be a plain, unmistakable 500).
    assert predict.status_code in (200, 503), predict.text


def test_authorization_spot_checks(world, api_client):
    assert api_client("GET", "/api/v1/orders").status_code == 401
    assert api_client("GET", "/api/v1/dealer/inventory", world.buyer.token).status_code == 403
    assert api_client("GET", "/api/v1/admin/stats", world.farmer.token).status_code == 403
    assert api_client("GET", "/api/v1/admin/stats", world.admin.token).status_code == 200


def test_other_buyer_cannot_read_someone_elses_order(world, api_client):
    order_id = world.extra["order_id"]
    response = api_client("GET", f"/api/v1/orders/{order_id}", world.buyer2.token)
    assert response.status_code in (403, 404)
