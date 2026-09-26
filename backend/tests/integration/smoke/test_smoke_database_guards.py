"""The database enforces the same order and consultation rules as the API (migration 20260927080000).

The P7 (7D) fresh-context verification showed that the API's role checks could be skipped by calling Supabase PostgREST
directly with a user's own JWT (a buyer could complete their own order, change its price, or make themselves the
seller). These tests drive the same real users through both paths and require the same answer, and repeat the
verifier's direct probes.
"""

from __future__ import annotations

import os
import subprocess

import httpx
import pytest

REST = os.environ.get("LOCAL_SUPABASE_URL", "") + "/rest/v1"
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")

ORDER_TARGETS = (
    "confirmed",
    "rejected",
    "cancelled",
    "payment_failed",
    "processing",
    "ready",
    "completed",
    "disputed",
    "refunded",
)
# The API never lets a participant request `expired` (only the lazy sweep sets it), so it is left out of the comparison.
WALK = ("confirmed", "processing", "ready", "completed")


def rest(method: str, table: str, token: str, query: str, body: dict | None = None) -> httpx.Response:
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    return httpx.request(method, f"{REST}/{table}?{query}", headers=headers, json=body, timeout=30)


def changed(response: httpx.Response) -> bool:
    """True when a PostgREST write really changed a row (a policy that hides the row answers 200 with `[]`)."""
    return response.status_code < 300 and bool(response.json())


def place_order(world, api_client) -> str:
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    return checkout.json()[0]["id"]


def order_in_status(world, api_client, status: str) -> str:
    order_id = place_order(world, api_client)
    if status == "pending":
        return order_id
    for step in WALK:
        moved = api_client("PATCH", f"/api/v1/orders/{order_id}/status", world.farmer.token, json={"to": step})
        assert moved.status_code == 204, moved.text
        if step == status:
            return order_id
    raise AssertionError(status)


def read_order(world, api_client, order_id: str) -> dict:
    response = api_client("GET", f"/api/v1/orders/{order_id}", world.buyer.token)
    assert response.status_code == 200, response.text
    return response.json()


def test_the_verifiers_direct_probes_are_refused(world, api_client):
    order_id = place_order(world, api_client)
    before = read_order(world, api_client, order_id)
    buyer = world.buyer.token

    attempts = [
        {"status": "confirmed"},
        {"status": "completed"},
        {"product_subtotal": 1},
        {"delivery_charge": 50},
        {"seller_id": world.buyer.id},
        {"buyer_id": world.farmer.id},
    ]
    for body in attempts:
        response = rest("PATCH", "orders", buyer, f"id=eq.{order_id}", body)
        assert not changed(response), (body, response.status_code, response.text)

    after = read_order(world, api_client, order_id)
    assert after["status"] == before["status"] == "pending"
    assert after["product_subtotal"] == before["product_subtotal"]
    assert after["seller_id"] == before["seller_id"]

    # the stranger's identical probe changes nothing either
    stranger = rest("PATCH", "orders", world.expert.token, f"id=eq.{order_id}", {"status": "cancelled"})
    assert not changed(stranger)


def test_the_seller_and_buyer_keep_the_moves_that_are_theirs_through_the_data_api(world, api_client):
    order_id = place_order(world, api_client)
    assert changed(rest("PATCH", "orders", world.farmer.token, f"id=eq.{order_id}", {"status": "confirmed"}))
    cancelled = place_order(world, api_client)
    assert changed(rest("PATCH", "orders", world.buyer.token, f"id=eq.{cancelled}", {"status": "cancelled"}))


@pytest.mark.parametrize("state", ["pending", "confirmed", "processing", "ready", "completed"])
@pytest.mark.parametrize("actor", ["buyer", "farmer"])
def test_the_api_and_the_database_agree_on_every_order_move(world, api_client, state, actor):
    """For each start state and participant, the set of targets each path accepts must be identical."""
    token = getattr(world, actor).token
    via_api, via_db = set(), set()
    api_order = order_in_status(world, api_client, state)
    db_order = order_in_status(world, api_client, state)

    for target in (t for t in ORDER_TARGETS if t != state):  # setting the same status again is a no-op
        api_result = api_client("PATCH", f"/api/v1/orders/{api_order}/status", token, json={"to": target})
        if api_result.status_code == 204:
            via_api.add(target)
            api_order = order_in_status(world, api_client, state)  # the order moved; start again from the same state
        if changed(rest("PATCH", "orders", token, f"id=eq.{db_order}", {"status": target})):
            via_db.add(target)
            db_order = order_in_status(world, api_client, state)

    assert via_db == via_api, f"{actor} from {state}: API allows {sorted(via_api)}, database allows {sorted(via_db)}"


def test_the_database_refuses_a_consultation_shortcut_and_a_pending_expert(world, api_client):
    request = api_client(
        "POST",
        "/api/v1/consultations",
        world.farmer.token,
        json={"expert_id": world.expert.id, "subject": "Guard probe", "problem_description": "yellow leaves"},
    )
    assert request.status_code in (200, 201), request.text
    consultation_id = request.json()["id"]

    for target in ("accepted", "in_progress", "resolved", "closed"):
        response = rest("PATCH", "consultations", world.farmer.token, f"id=eq.{consultation_id}", {"status": target})
        assert not changed(response), (target, response.text)
    assert not changed(rest("PATCH", "consultations", world.farmer.token, f"id=eq.{consultation_id}", {"subject": "x"}))
    # the expert's own move still works
    assert changed(
        rest("PATCH", "consultations", world.expert.token, f"id=eq.{consultation_id}", {"status": "accepted"})
    )

    # a consultation with yourself is refused (pgTAP and test_smoke_expert_application cover the unverified expert)
    insert = rest(
        "POST",
        "consultations",
        world.farmer.token,
        "select=id",
        {"user_id": world.farmer.id, "expert_id": world.farmer.id, "subject": "Myself"},
    )
    assert not changed(insert), insert.text


# --- INSERT paths, payments, stock, history and expiry (migration 20260927090000) --------------------------------


def age_order(order_id: str) -> None:
    """Back-dates an order through the local database container (there is no client path for this, on purpose)."""
    sql = f"update public.orders set created_at = '2020-01-01' where id = '{order_id}'"
    done = subprocess.run(
        ["docker", "exec", "supabase_db_ZaraiLink_V1", "psql", "-U", "postgres", "-d", "postgres", "-c", sql],
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert done.returncode == 0, done.stderr
    assert "UPDATE 1" in done.stdout, done.stdout


def test_a_forged_order_is_normalised_or_refused_and_cannot_be_used_to_review(world, api_client):
    buyer = world.buyer.token
    forged = rest(
        "POST",
        "orders",
        buyer,
        "select=id,status,product_subtotal,seller_id",
        {"buyer_id": world.buyer.id, "seller_id": world.farmer.id, "status": "completed", "product_subtotal": 0},
    )
    assert forged.status_code == 201, forged.text
    row = forged.json()[0]
    assert row["status"] == "pending"  # the client's status is ignored
    assert float(row["product_subtotal"]) == 0

    # refused: buying from yourself, and from someone who does not sell
    for seller in (world.buyer.id, world.expert.id):
        refused = rest("POST", "orders", buyer, "select=id", {"buyer_id": world.buyer.id, "seller_id": seller})
        assert not changed(refused), (seller, refused.text)

    # an item at price 0 is stored at the listing's price, and the subtotal follows the items
    item = rest(
        "POST",
        "order_items",
        buyer,
        "select=unit_price",
        {"order_id": row["id"], "listing_id": world.farmer_listing_id, "quantity": 10, "unit_price": 0},
    )
    assert item.status_code == 201, item.text
    price = float(api_client("GET", f"/api/v1/marketplace/listings/{world.farmer_listing_id}", buyer).json()["price"])
    assert float(item.json()[0]["unit_price"]) == price
    assert float(read_order(world, api_client, row["id"])["product_subtotal"]) == price * 10

    # a review needs a completed order; this one is pending, so writing about anyone with it is refused
    review = rest(
        "POST",
        "reviews",
        buyer,
        "select=id",
        {"order_id": row["id"], "seller_id": world.farmer.id, "buyer_id": world.buyer.id, "rating": 1},
    )
    assert not changed(review), review.text

    # history cannot be forged
    history = rest(
        "POST",
        "order_status_history",
        buyer,
        "select=id",
        {"order_id": row["id"], "from_status": "ready", "to_status": "completed", "changed_by": world.farmer.id},
    )
    assert not changed(history), history.text


def test_a_payment_cannot_be_forged_re_opened_or_rewritten(world, api_client):
    order_id = place_order(world, api_client)
    total = float(read_order(world, api_client, order_id)["total"])
    buyer = world.buyer.token

    opened = rest(
        "POST",
        "payments",
        buyer,
        "select=id,status,amount",
        {
            "order_id": order_id,
            "buyer_id": world.buyer.id,
            "status": "successful",
            "amount": 1,
            "method": "cod",
            "provider": "manual",
        },
    )
    assert opened.status_code == 201, opened.text
    payment = opened.json()[0]
    assert payment["status"] == "pending"  # a forged status is ignored
    assert float(payment["amount"]) == total  # and so is a forged amount

    body = {"order_id": order_id, "buyer_id": world.buyer.id, "method": "cod", "provider": "manual"}
    assert not changed(rest("POST", "payments", buyer, "select=id", body))  # a second payment for the same order
    stranger = {"order_id": order_id, "buyer_id": world.buyer2.id, "method": "cod", "provider": "manual"}
    assert not changed(rest("POST", "payments", world.buyer2.token, "select=id", stranger))

    query = f"id=eq.{payment['id']}"
    assert not changed(
        rest("PATCH", "payments", buyer, query, {"status": "successful"})
    )  # the buyer cannot mark it paid
    assert not changed(
        rest("PATCH", "payments", world.admin.token, query, {"status": "failed"})
    )  # an admin has no action
    assert not changed(rest("PATCH", "payments", world.farmer.token, query, {"amount": 12345}))
    assert changed(rest("PATCH", "payments", world.farmer.token, query, {"status": "successful"}))  # the seller decides
    for status in ("pending", "failed"):
        assert not changed(rest("PATCH", "payments", world.farmer.token, query, {"status": status}))

    events = rest("GET", "payment_transactions", world.farmer.token, f"payment_id=eq.{payment['id']}&select=event_type")
    assert [event["event_type"] for event in events.json()] == ["manual_confirmation"]  # written by the database
    forged_event = {"payment_id": payment["id"], "event_type": "forged"}
    assert not changed(rest("POST", "payment_transactions", world.farmer.token, "select=id", forged_event))


def test_confirming_directly_still_commits_the_stock_once_and_leaves_history(world, api_client):
    def stock() -> float:
        items = api_client("GET", "/api/v1/dealer/inventory", world.dealer.token).json()
        return float(next(i for i in items if i["id"] == world.dealer_inventory_id)["stock_quantity"])

    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.dealer_listing_id, "quantity": 2}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    before = stock()

    # the seller skips the API and confirms through the data API: the stock is committed by the same statement
    assert changed(rest("PATCH", "orders", world.dealer.token, f"id=eq.{order_id}", {"status": "confirmed"}))
    assert stock() == before - 2

    history = api_client("GET", f"/api/v1/orders/{order_id}/status-history", world.dealer.token).json()
    assert {(h["from_status"], h["to_status"]) for h in history} == {(None, "pending"), ("pending", "confirmed")}

    # the stock function is not an API: it cannot be called to reduce the stock again
    rpc = httpx.post(
        f"{REST}/rpc/reduce_stock_for_order",
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {world.dealer.token}",
            "Content-Type": "application/json",
        },
        json={"p_order_id": order_id, "p_actor": world.dealer.id},
        timeout=30,
    )
    assert rpc.status_code >= 400, rpc.text
    assert stock() == before - 2


def test_a_stale_pending_order_expires_and_both_parties_can_still_read_their_orders(world, api_client):
    stale = place_order(world, api_client)
    fresh = place_order(world, api_client)
    assert not changed(rest("PATCH", "orders", world.buyer.token, f"id=eq.{fresh}", {"status": "expired"}))  # too early

    age_order(stale)

    for actor, side in ((world.buyer, "buyer"), (world.farmer, "seller")):
        listing = api_client("GET", f"/api/v1/orders?as={side}", actor.token)
        assert listing.status_code == 200, listing.text  # was a 500 once an order had expired
        one = api_client("GET", f"/api/v1/orders/{stale}", actor.token)
        assert one.status_code == 200, one.text
        assert one.json()["status"] == "expired"
    history = api_client("GET", f"/api/v1/orders/{stale}/status-history", world.buyer.token).json()
    expired = [h for h in history if h["to_status"] == "expired"]
    assert expired
    assert all(h["changed_by"] is None for h in expired)


def test_a_consultation_cannot_be_opened_in_a_later_status(world):
    for status in ("accepted", "resolved", "closed"):
        response = rest(
            "POST",
            "consultations",
            world.farmer.token,
            "select=id",
            {"user_id": world.farmer.id, "expert_id": world.expert.id, "subject": "Forged", "status": status},
        )
        assert not changed(response), (status, response.text)


# --- stock and payment integrity (migration 20260927100000) --------------------------------------------------------


def test_checkout_returns_the_priced_order(world, api_client):
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 3}]},
    )
    assert checkout.status_code == 200, checkout.text
    listing = rest("GET", "listings", world.buyer.token, f"id=eq.{world.farmer_listing_id}&select=price").json()[0]
    # was 0: the order was read before its items existed
    assert float(checkout.json()[0]["product_subtotal"]) == 3 * float(listing["price"])


def test_a_dealer_cannot_plant_inventory_on_another_sellers_listing(world, api_client):
    planted = rest(
        "POST",
        "inventory",
        world.dealer.token,
        "select=id",
        {"dealer_id": world.dealer.id, "listing_id": world.farmer_listing_id, "stock_quantity": 0},
    )
    assert not changed(planted), planted.text

    # nor point their own row at it
    repointed = rest(
        "PATCH",
        "inventory",
        world.dealer.token,
        f"id=eq.{world.dealer_inventory_id}",
        {"listing_id": world.farmer_listing_id},
    )
    assert not changed(repointed), repointed.text

    # a second row for a listing they do own is refused too (one row per listing)
    duplicate = rest(
        "POST",
        "inventory",
        world.dealer.token,
        "select=id",
        {"dealer_id": world.dealer.id, "listing_id": world.dealer_listing_id, "stock_quantity": 1},
    )
    assert not changed(duplicate), duplicate.text


def test_an_order_takes_one_line_per_listing(world, api_client):
    order_id = place_order(world, api_client)
    again = rest(
        "POST",
        "order_items",
        world.buyer.token,
        "select=id",
        {"order_id": order_id, "listing_id": world.farmer_listing_id, "quantity": 1},
    )
    assert not changed(again), again.text  # the listing already has its line


def test_a_payment_on_a_cancelled_order_cannot_be_decided(world, api_client):
    order_id = place_order(world, api_client)
    buyer = world.buyer.token
    payment = api_client("POST", "/api/v1/payments", buyer, json={"order_id": order_id, "method": "cod"})
    assert payment.status_code in (200, 201), payment.text
    payment_id = payment.json()["id"]
    cancelled = api_client("PATCH", f"/api/v1/orders/{order_id}/status", buyer, json={"to": "cancelled"})
    assert cancelled.status_code == 204, cancelled.text

    seller = world.farmer.token
    assert api_client("PATCH", f"/api/v1/payments/{payment_id}/received", seller).status_code == 409
    direct = rest("PATCH", "payments", seller, f"id=eq.{payment_id}", {"status": "successful"})
    assert not changed(direct), direct.text  # PostgREST agrees


def test_a_review_can_only_name_a_listing_the_order_contained(world, api_client):
    order_id = order_in_status(world, api_client, "completed")
    buyer = world.buyer.token
    stranger = rest(
        "POST",
        "reviews",
        buyer,
        "select=id",
        {
            "order_id": order_id,
            "seller_id": world.farmer.id,
            "buyer_id": world.buyer.id,
            "listing_id": world.dealer_listing_id,
            "rating": 1,
        },
    )
    assert not changed(stranger), stranger.text
