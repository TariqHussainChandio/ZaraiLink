"""Who may move an order: the seller confirms and fulfils, the buyer cancels or disputes, an admin resolves disputes.

Found by the P7 (7D) real-stack hook test: the API used to let a buyer confirm or complete their own order, because
only the app hid the buttons. These tests pin the rule for real users against the real API and database.
"""

from __future__ import annotations


def _place_order(world, api_client) -> str:
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    return checkout.json()[0]["id"]


def _move(api_client, order_id: str, token: str, to: str):
    return api_client("PATCH", f"/api/v1/orders/{order_id}/status", token, json={"to": to})


def test_the_buyer_cannot_make_the_sellers_moves_but_the_seller_can(world, api_client):
    order_id = _place_order(world, api_client)

    # rejected path: the buyer trying to confirm, or to skip ahead
    assert _move(api_client, order_id, world.buyer.token, "confirmed").status_code == 403
    assert _move(api_client, order_id, world.buyer.token, "rejected").status_code == 403

    # allowed path: the seller confirms
    assert _move(api_client, order_id, world.farmer.token, "confirmed").status_code == 204

    # at every later step the buyer is refused the move that is next in line, and the seller is not
    for to in ("processing", "ready", "completed"):
        assert _move(api_client, order_id, world.buyer.token, to).status_code == 403, to
        assert _move(api_client, order_id, world.farmer.token, to).status_code == 204, to


def test_only_the_buyer_disputes_and_only_an_admin_resolves(world, api_client):
    order_id = _place_order(world, api_client)
    for to in ("confirmed", "processing", "ready", "completed"):
        assert _move(api_client, order_id, world.farmer.token, to).status_code == 204, to

    assert _move(api_client, order_id, world.farmer.token, "disputed").status_code == 403  # not the seller
    # not a participant: the order is not even visible to them (404), never a success
    assert _move(api_client, order_id, world.expert.token, "disputed").status_code in (403, 404)
    assert _move(api_client, order_id, world.buyer.token, "disputed").status_code == 204

    # neither side can settle the dispute in their own favour
    assert _move(api_client, order_id, world.farmer.token, "completed").status_code == 403
    assert _move(api_client, order_id, world.buyer.token, "refunded").status_code == 403
    assert _move(api_client, order_id, world.admin.token, "refunded").status_code == 204


def test_either_side_can_cancel_a_pending_order(world, api_client):
    by_buyer = _place_order(world, api_client)
    assert _move(api_client, by_buyer, world.buyer.token, "cancelled").status_code == 204
    by_seller = _place_order(world, api_client)
    assert _move(api_client, by_seller, world.farmer.token, "cancelled").status_code == 204
    outsider = _place_order(world, api_client)
    assert _move(api_client, outsider, world.expert.token, "cancelled").status_code in (403, 404)
