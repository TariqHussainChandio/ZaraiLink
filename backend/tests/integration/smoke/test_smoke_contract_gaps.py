"""P7 (7A): real calls for the operations no other smoke test makes, so every documented response is compared with its
published OpenAPI schema (see contract.py and test_zz_contract_coverage.py). Each call also asserts its own status, so
these are ordinary smoke tests as well, not only schema probes."""

from __future__ import annotations

import io

import httpx
from conftest import ANON_KEY, LOCAL_URL
from PIL import Image


def _completed_order(world, api_client) -> str:
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    for to_status in ("confirmed", "processing", "ready", "completed"):
        moved = api_client("PATCH", f"/api/v1/orders/{order_id}/status", world.farmer.token, json={"to": to_status})
        assert moved.status_code == 204, moved.text
    return order_id


def test_listings_detail_update_and_views(world, api_client):
    listing = api_client("GET", f"/api/v1/marketplace/listings/{world.farmer_listing_id}")
    assert listing.status_code == 200, listing.text
    assert listing.json()["owner"]["id"] == world.farmer.id
    updated = api_client(
        "PATCH", f"/api/v1/marketplace/listings/{world.farmer_listing_id}", world.farmer.token, json={"price": 55}
    )
    assert updated.status_code == 200, updated.text
    view = api_client("POST", f"/api/v1/marketplace/listings/{world.farmer_listing_id}/views", world.buyer2.token)
    assert view.status_code == 204, view.text
    # An owner viewing their own listing is refused by RLS on purpose; the API treats it as "not counted".
    own = api_client("POST", f"/api/v1/marketplace/listings/{world.farmer_listing_id}/views", world.farmer.token)
    assert own.status_code == 204, own.text
    counts = api_client(
        "POST",
        "/api/v1/marketplace/listings/view-counts",
        world.farmer.token,
        json={"listing_ids": [world.farmer_listing_id]},
    )
    assert counts.status_code == 200, counts.text
    assert counts.json().get(world.farmer_listing_id, 0) >= 1


def test_dealer_store_supplier_and_inventory_updates(world, api_client):
    d = world.dealer.token
    store = api_client("GET", f"/api/v1/dealer/stores/{world.dealer_store_id}", d)
    assert store.status_code == 200, store.text
    renamed = api_client("PATCH", f"/api/v1/dealer/stores/{world.dealer_store_id}", d, json={"name": "Renamed store"})
    assert renamed.status_code == 200, renamed.text

    created = api_client("POST", "/api/v1/dealer/suppliers", d, json={"name": "Contract supplier"})
    assert created.status_code == 200, created.text
    supplier_id = created.json()["id"]
    assert api_client("GET", f"/api/v1/dealer/suppliers/{supplier_id}", d).status_code == 200
    patched = api_client("PATCH", f"/api/v1/dealer/suppliers/{supplier_id}", d, json={"name": "Renamed supplier"})
    assert patched.status_code == 200, patched.text

    inventory_id = world.dealer_inventory_id
    assert api_client("PATCH", f"/api/v1/dealer/inventory/{inventory_id}", d, json={"unit": "kg"}).status_code == 200
    adjusted = api_client(
        "POST", f"/api/v1/dealer/inventory/{inventory_id}/adjust", d, json={"type": "addition", "quantity": 1}
    )
    assert adjusted.status_code == 200, adjusted.text


def test_payment_read_and_failure(world, api_client):
    order_id = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    ).json()[0]["id"]
    payment = api_client("POST", "/api/v1/payments", world.buyer.token, json={"order_id": order_id, "method": "cod"})
    assert payment.status_code == 200, payment.text
    payment_id = payment.json()["id"]
    assert api_client("GET", f"/api/v1/payments/{payment_id}", world.buyer.token).status_code == 200
    failed = api_client(
        "PATCH", f"/api/v1/payments/{payment_id}/failed", world.farmer.token, json={"reason": "contract test"}
    )
    assert failed.status_code == 200, failed.text


def test_review_read_by_id(world, api_client):
    order_id = _completed_order(world, api_client)
    review = api_client(
        "POST", "/api/v1/reviews", world.buyer.token, json={"order_id": order_id, "rating": 4, "comment": "contract"}
    )
    assert review.status_code == 200, review.text
    read = api_client("GET", f"/api/v1/reviews/{review.json()['id']}")
    assert read.status_code == 200, read.text


def test_disease_case_read(world, api_client):
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (30, 100, 40)).save(buffer, format="JPEG")
    path = f"{world.buyer.id}/contract-leaf.jpg"
    upload = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/disease-images/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {world.buyer.token}", "Content-Type": "image/jpeg"},
        content=buffer.getvalue(),
        timeout=30,
    )
    assert upload.status_code in (200, 201), upload.text
    case = api_client("POST", "/api/v1/disease/cases", world.buyer.token, json={"storage_path": path})
    assert case.status_code == 200, case.text
    read = api_client("GET", f"/api/v1/disease/cases/{case.json()['id']}", world.buyer.token)
    assert read.status_code == 200, read.text


def test_consultation_images_update(world, api_client):
    created = api_client(
        "POST",
        "/api/v1/consultations",
        world.farmer.token,
        json={
            "expert_id": world.expert.id,
            "subject": "Contract consultation",
            "crop_id": None,
            "problem_description": "spots on leaves",
            "priority": "low",
        },
    )
    assert created.status_code == 200, created.text
    images = api_client(
        "PATCH",
        f"/api/v1/consultations/{created.json()['id']}/images",
        world.farmer.token,
        json={"images": []},
    )
    assert images.status_code == 204, images.text
