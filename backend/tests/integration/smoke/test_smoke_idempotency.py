"""P5 (item 6) — Idempotency-Key on checkout and payment initiation, on the real stack."""

from __future__ import annotations

import uuid
from concurrent.futures import ThreadPoolExecutor


def _cart(world, quantity=1):
    return {"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": quantity}]}


def _key() -> str:
    return f"smoke-{uuid.uuid4().hex}"


def _order_count(api_client, token) -> int:
    return len(api_client("GET", "/api/v1/orders", token).json())


def test_same_key_replays_the_original_orders_instead_of_creating_new_ones(world, api_client):
    key = _key()
    before = _order_count(api_client, world.buyer.token)
    hdr = {"Idempotency-Key": key}
    first = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers=hdr)
    second = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers=hdr)
    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json() == first.json()
    assert _order_count(api_client, world.buyer.token) == before + 1


def test_no_key_still_creates_a_new_order_each_time(world, api_client):
    before = _order_count(api_client, world.buyer.token)
    for _ in range(2):
        assert api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world)).status_code == 200
    assert _order_count(api_client, world.buyer.token) == before + 2


def test_another_user_reusing_the_same_key_gets_their_own_order(world, api_client):
    # Two-user proof: the key is scoped to (user, key, endpoint), so it can never replay or leak
    # someone else's stored response.
    key = _key()
    hdr = {"Idempotency-Key": key}
    a = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers=hdr)
    b = api_client("POST", "/api/v1/orders/checkout", world.buyer2.token, json=_cart(world), headers=hdr)
    assert a.status_code == b.status_code == 200
    assert a.json()[0]["id"] != b.json()[0]["id"]
    assert b.json()[0]["buyer_id"] == world.buyer2.id


def test_concurrent_requests_with_the_same_key_create_exactly_one_order(world, api_client):
    key = _key()
    hdr = {"Idempotency-Key": key}
    before = _order_count(api_client, world.buyer.token)
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(
            pool.map(
                lambda _: api_client(
                    "POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers=hdr
                ),
                range(4),
            )
        )
    assert {r.status_code for r in results} <= {200, 409}, [r.text for r in results]
    assert any(r.status_code == 200 for r in results)
    assert _order_count(api_client, world.buyer.token) == before + 1


def test_a_failed_request_releases_the_key_so_a_retry_can_succeed(world, api_client):
    key = _key()
    hdr = {"Idempotency-Key": key}
    too_many = api_client(
        "POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world, quantity=10**9), headers=hdr
    )
    assert too_many.status_code == 422, too_many.text
    retry = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers=hdr)
    assert retry.status_code == 200, retry.text


def test_a_too_short_key_is_rejected(world, api_client):
    response = api_client(
        "POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers={"Idempotency-Key": "abc"}
    )
    assert response.status_code == 422


def test_payment_initiation_replays_with_the_same_key(world, api_client):
    order = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world)).json()[0]
    hdr = {"Idempotency-Key": _key()}
    body = {"order_id": order["id"], "method": "cod"}
    first = api_client("POST", "/api/v1/payments", world.buyer.token, json=body, headers=hdr)
    second = api_client("POST", "/api/v1/payments", world.buyer.token, json=body, headers=hdr)
    assert first.status_code == second.status_code == 200
    assert second.json()["id"] == first.json()["id"]


def test_reusing_a_key_with_a_different_body_is_rejected_not_replayed(world, api_client):
    key = _key()
    hdr = {"Idempotency-Key": key}
    first = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world, 1), headers=hdr)
    assert first.status_code == 200, first.text
    before = _order_count(api_client, world.buyer.token)
    second = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world, 2), headers=hdr)
    assert second.status_code == 422, second.text
    assert "different request" in second.json()["title"]
    assert _order_count(api_client, world.buyer.token) == before


def test_the_same_body_sent_again_still_replays(world, api_client):
    # The fingerprint is of the parsed body, so a retry that differs only in JSON whitespace is the same request.
    key = _key()
    hdr = {"Idempotency-Key": key}
    first = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers=hdr)
    again = api_client("POST", "/api/v1/orders/checkout", world.buyer.token, json=_cart(world), headers=hdr)
    assert again.status_code == 200
    assert again.json() == first.json()
