"""A4, B0 and B3 on the real stack (20261019080000_order_dispatch.sql, 20261019090000_inventory_boundary.sql,
20261022090000_inventory_sync.sql).

Through the real API and database: stock leaves the seller when the order is dispatched, never at confirm (D5); a known
shortage refuses the dispatch and changes nothing (D6); every dispatched line writes exactly one outbox event, applied
to the dealer's IMS stock in the same transaction (D7, SRDS §21); a farmer's listing loses its own quantity and is sold
at 0; buyers see a stock word, never figures; experts and the admin cannot check out (D9); and a pending dealer or the
admin reaches no inventory data in the IMS tables (B0, SRDS §15-§16). Two real database sessions race two dispatches
for the same stock. The dealer's stock is set up through the legacy /api/v1/dealer/inventory route, which B3 serves from
the IMS tables (a product linked to the listing, its stock at the default location).
"""

from __future__ import annotations

import json
import os
import subprocess
import time
import uuid

import httpx
from conftest import _local_db_container

REST = os.environ.get("LOCAL_SUPABASE_URL", "") + "/rest/v1"
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
HOLD_SECONDS = 3


def _sql(statement: str) -> str:
    """One statement as the database owner (the outbox is server side only), returning psql's unaligned output."""
    return subprocess.run(
        ["docker", "exec", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", statement],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def _events(order_id: str) -> list[str]:
    rows = _sql(
        "select order_item_id || '|' || quantity || '|' || (inventory_applied_at is not null) "
        f"from public.order_events where order_id = '{order_id}' order by created_at"
    )
    return rows.splitlines() if rows else []


def _listing(api_client, world, title: str, quantity: float, stock: float | None = None, threshold: float = 0) -> str:
    """A listing of the dealer's (with an inventory row when `stock` is given) or, for `stock=None`, of the farmer's."""
    seller = world.dealer if stock is not None else world.farmer
    created = api_client(
        "POST",
        "/api/v1/marketplace/listings",
        seller.token,
        json={"title": title, "price": 10.0, "unit": "bag", "quantity": quantity, "category_id": world.category_id},
    )
    assert created.status_code in (200, 201), created.text
    listing_id = created.json()["id"]
    if stock is not None:
        row = api_client(
            "POST",
            "/api/v1/dealer/inventory",
            world.dealer.token,
            json={"listing_id": listing_id, "stock_quantity": stock, "unit": "bag", "min_stock_threshold": threshold},
        )
        assert row.status_code in (200, 201), row.text
    return listing_id


def _buy(api_client, buyer, listing_id: str, quantity: float) -> str:
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        buyer.token,
        json={"cart_items": [{"listing_id": listing_id, "quantity": quantity}]},
    )
    assert checkout.status_code == 200, checkout.text
    return checkout.json()[0]["id"]


def _move(api_client, seller, order_id: str, *steps: str) -> httpx.Response:
    response = None
    for step in steps:
        response = api_client("PATCH", f"/api/v1/orders/{order_id}/status", seller.token, json={"to": step})
        if response.status_code != 204:
            return response
    assert response is not None
    return response


def _stock(api_client, world, listing_id: str) -> float:
    rows = api_client("GET", "/api/v1/dealer/inventory", world.dealer.token).json()
    return float(next(r for r in rows if r["listing_id"] == listing_id)["stock_quantity"])


def test_a_dealer_order_takes_its_stock_at_dispatch_once_and_writes_one_event(world, api_client):
    listing_id = _listing(api_client, world, "Dispatch urea", quantity=1, stock=10, threshold=4)
    order_id = _buy(api_client, world.buyer, listing_id, 4)

    assert _move(api_client, world.dealer, order_id, "confirmed", "processing", "ready").status_code == 204
    assert _stock(api_client, world, listing_id) == 10  # D5: nothing taken before dispatch
    assert _events(order_id) == []

    assert _move(api_client, world.dealer, order_id, "dispatched").status_code == 204
    assert _stock(api_client, world, listing_id) == 6
    events = _events(order_id)
    assert len(events) == 1, events
    assert events[0].endswith("|4.00|true"), events  # one line, 4 units, already applied

    # dispatching again is refused, and neither the stock nor the outbox moves (SRDS §21)
    again = _move(api_client, world.dealer, order_id, "dispatched")
    assert again.status_code == 422, again.text
    assert _stock(api_client, world, listing_id) == 6
    assert len(_events(order_id)) == 1

    # the buyer sees the order dispatched, and the listing as a word: 6 left is above its threshold of 4
    assert api_client("GET", f"/api/v1/orders/{order_id}", world.buyer.token).json()["status"] == "dispatched"
    assert api_client("GET", f"/api/v1/marketplace/listings/{listing_id}").json()["availability"] == "in_stock"
    assert _move(api_client, world.dealer, order_id, "completed").status_code == 204


def test_an_order_cancelled_before_dispatch_takes_nothing_and_writes_no_event(world, api_client):
    listing_id = _listing(api_client, world, "Dispatch DAP", quantity=1, stock=8)
    order_id = _buy(api_client, world.buyer, listing_id, 3)
    assert _move(api_client, world.dealer, order_id, "confirmed").status_code == 204
    cancelled = api_client("PATCH", f"/api/v1/orders/{order_id}/status", world.buyer.token, json={"to": "cancelled"})
    assert cancelled.status_code == 204, cancelled.text
    assert _stock(api_client, world, listing_id) == 8
    assert _events(order_id) == []


def test_a_farmer_listing_loses_its_own_quantity_and_is_sold_at_zero(world, api_client):
    listing_id = _listing(api_client, world, "Dispatch tomatoes", quantity=2)
    order_id = _buy(api_client, world.dealer, listing_id, 2)  # a dealer buys from a farmer (SRDS §28)
    assert _move(api_client, world.farmer, order_id, "confirmed", "processing", "ready").status_code == 204
    assert api_client("GET", f"/api/v1/marketplace/listings/{listing_id}").json()["quantity"] == 2

    assert _move(api_client, world.farmer, order_id, "dispatched").status_code == 204
    # sold, it is off the market: a buyer cannot open it, but its owner can, and finds it in their own list
    assert api_client("GET", f"/api/v1/marketplace/listings/{listing_id}", world.buyer.token).status_code == 404
    mine = api_client("GET", f"/api/v1/marketplace/listings?owner_id={world.farmer.id}", world.farmer.token).json()
    assert listing_id in [row["id"] for row in mine]
    listing = api_client("GET", f"/api/v1/marketplace/listings/{listing_id}", world.farmer.token).json()
    assert listing["quantity"] == 0
    assert listing["status"] == "sold"
    assert listing["availability"] == "out_of_stock"
    assert len(_events(order_id)) == 1

    # the farmer restocks it and it is for sale again
    restocked = api_client(
        "PATCH", f"/api/v1/marketplace/listings/{listing_id}", world.farmer.token, json={"quantity": 5}
    )
    assert restocked.status_code == 200, restocked.text
    listing = api_client("GET", f"/api/v1/marketplace/listings/{listing_id}").json()
    assert (listing["status"], listing["availability"]) == ("active", "in_stock")


def test_a_known_shortage_refuses_the_dispatch_and_changes_nothing(world, api_client):
    listing_id = _listing(api_client, world, "Dispatch potash", quantity=1, stock=5, threshold=2)
    first = _buy(api_client, world.buyer, listing_id, 4)
    second = _buy(api_client, world.buyer2, listing_id, 4)
    for order_id in (first, second):  # both fit the 5 on their own, so both are confirmed (D5 checks, takes nothing)
        assert _move(api_client, world.dealer, order_id, "confirmed", "processing", "ready").status_code == 204

    assert _move(api_client, world.dealer, first, "dispatched").status_code == 204
    refused = _move(api_client, world.dealer, second, "dispatched")
    assert refused.status_code == 422, refused.text
    assert refused.json()["code"] == "insufficient_stock"
    assert "Not enough stock to dispatch" in refused.text

    assert _stock(api_client, world, listing_id) == 1
    assert api_client("GET", f"/api/v1/orders/{second}", world.dealer.token).json()["status"] == "ready"
    assert _events(second) == []
    # 1 left, under the threshold of 2: low
    assert api_client("GET", f"/api/v1/marketplace/listings/{listing_id}").json()["availability"] == "low_stock"


def test_experts_and_the_admin_cannot_check_out(world, api_client):
    for actor in (world.expert, world.admin):
        refused = api_client(
            "POST",
            "/api/v1/orders/checkout",
            actor.token,
            json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
        )
        assert refused.status_code == 403, refused.text
        assert refused.json()["code"] == "insufficient_role"


def _rest_select(table: str, token: str, query: str) -> list:
    response = httpx.get(
        f"{REST}/{table}?{query}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}"},
        timeout=30,
    )
    assert response.status_code == 200, response.text
    return response.json()


# Every IMS table a dealer's data lives in (20261021080000_inventory_data_model.sql); B3 dropped the legacy inventory,
# dealer_stores, suppliers and inventory_transactions tables these checks used to read.
IMS_TABLES = (
    "inventory_products",
    "inventory_stock",
    "inventory_locations",
    "inventory_movements",
    "inventory_suppliers",
    "inventory_purchases",
    "inventory_sync_log",
)


def _seed_pending_inventory(dealer_id: str) -> None:
    """IMS rows of a pending dealer's, written as the database owner: through the API they could never have any (every
    write route refuses them), and that is the point. Stock and the ledger come from inventory_apply_movement, the only
    writer of both. A sync log row needs a dispatched order, which a pending dealer cannot have."""
    uuid.UUID(dealer_id)  # interpolated into SQL below
    location, product = str(uuid.uuid4()), str(uuid.uuid4())
    _sql(
        f"insert into public.inventory_locations (id, dealer_id, name, is_default) "
        f"values ('{location}', '{dealer_id}', 'Pending shop', true); "
        f"insert into public.inventory_products (id, dealer_id, sku, name) "
        f"values ('{product}', '{dealer_id}', 'PEND-1', 'Pending urea'); "
        f"insert into public.inventory_suppliers (dealer_id, name) values ('{dealer_id}', 'Pending depot'); "
        f"insert into public.inventory_purchases (dealer_id, reference) values ('{dealer_id}', 'PO-PENDING'); "
        f"select public.inventory_apply_movement('{dealer_id}', '{product}', '{location}', 'in', 'OTHER', 3, "
        "'B0 proof', null)"
    )


def _owner_count(table: str, dealer_id: str) -> int:
    return int(_sql(f"select count(*) from public.{table} where dealer_id = '{dealer_id}'"))


def test_a_pending_dealer_and_the_admin_reach_no_inventory_data(world, api_client, make_applicant):
    """B0 on the IMS tables: through both doors, the API and PostgREST, with the approved owner's own reads as the
    allowed path. Each refused read is checked against rows that do exist (counted as the database owner), so an empty
    answer means refused, not merely empty."""
    pending_id, _, pending_token = make_applicant("dealer")
    _seed_pending_inventory(pending_id)
    for table in IMS_TABLES[:-1]:
        assert _owner_count(table, pending_id) > 0, table

    # The API: every inventory read and a write refuse the pending dealer for who they are, on the IMS routes and on
    # the legacy dealer routes that B3 repointed at the IMS tables.
    for path in (
        "/api/v1/inventory/products",
        "/api/v1/inventory/stock",
        "/api/v1/inventory/locations",
        "/api/v1/inventory/movements",
        "/api/v1/inventory/suppliers",
        "/api/v1/inventory/purchases",
        "/api/v1/inventory/sync/log",
        "/api/v1/dealer/inventory",
        "/api/v1/dealer/stores",
        "/api/v1/dealer/suppliers",
    ):
        refused = api_client("GET", path, pending_token)
        assert refused.status_code == 403, (path, refused.text)
        assert refused.json()["code"] == "account_not_approved", (path, refused.text)
    added = api_client("POST", "/api/v1/inventory/products", pending_token, json={"sku": "PEND-2", "name": "More urea"})
    assert added.status_code == 403, added.text
    assert _owner_count("inventory_products", pending_id) == 1

    # PostgREST: the pending dealer does not read even their own rows
    for table in IMS_TABLES:
        assert _rest_select(table, pending_token, f"dealer_id=eq.{pending_id}") == [], table

    # The admin reads none of the approved dealer's rows, the sync log included. One dispatch of a linked listing makes
    # sure the dealer has a row in every table, whichever tests ran before this one.
    listing_id = _listing(api_client, world, "Dispatch B0 proof", quantity=1, stock=2)
    order_id = _buy(api_client, world.buyer, listing_id, 1)
    assert (
        _move(api_client, world.dealer, order_id, "confirmed", "processing", "ready", "dispatched").status_code == 204
    )
    for table in IMS_TABLES:
        if table not in ("inventory_suppliers", "inventory_purchases"):  # world's dealer keeps neither
            assert _owner_count(table, world.dealer.id) > 0, table
        assert _rest_select(table, world.admin.token, f"dealer_id=eq.{world.dealer.id}") == [], table
        # nor anyone's: the pending dealer's supplier and purchase rows exist, so this covers those two tables too
        assert _rest_select(table, world.admin.token, "select=dealer_id&limit=1") == [], table

    # the approved owner does read theirs, through both doors
    assert _rest_select("inventory_products", world.dealer.token, f"id=eq.{world.dealer_inventory_id}") != []
    assert _rest_select("inventory_stock", world.dealer.token, f"product_id=eq.{world.dealer_inventory_id}") != []
    assert _rest_select("inventory_sync_log", world.dealer.token, f"dealer_id=eq.{world.dealer.id}") != []
    own = api_client("GET", "/api/v1/inventory/products", world.dealer.token)
    assert own.status_code == 200, own.text
    assert world.dealer_inventory_id in [row["id"] for row in own.json()]

    # and no client reads the outbox
    outbox = httpx.get(
        f"{REST}/order_events?select=id",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {world.dealer.token}"},
        timeout=30,
    )
    assert outbox.status_code in (401, 403), outbox.text


def _as_user(user_id: str, statement: str, hold: bool = False) -> list[str]:
    claims = json.dumps({"sub": user_id, "role": "authenticated"})
    hold_sql = f" select pg_sleep({HOLD_SECONDS});" if hold else ""
    sql = (
        f"begin; set local role authenticated; set local request.jwt.claims = '{claims}'; "
        f"{statement};{hold_sql} commit;"
    )
    return ["docker", "exec", "-i", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres",
            "-v", "ON_ERROR_STOP=1", "-At", "-c", sql]  # fmt: skip


def test_two_dispatches_racing_for_the_same_stock_cannot_both_take_it(world, api_client):
    """D6 under concurrency: the second dispatch waits for the first's row lock, then sees the stock already gone."""
    listing_id = _listing(api_client, world, "Dispatch race seed", quantity=1, stock=5)
    first = _buy(api_client, world.buyer, listing_id, 4)
    second = _buy(api_client, world.buyer2, listing_id, 4)
    for order_id in (first, second):
        assert _move(api_client, world.dealer, order_id, "confirmed", "processing", "ready").status_code == 204

    dispatch = "update public.orders set status = 'dispatched' where id = '{}'"
    held = subprocess.Popen(
        _as_user(world.dealer.id, dispatch.format(first), hold=True),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    time.sleep(1)
    started = time.monotonic()
    late = subprocess.run(_as_user(world.dealer.id, dispatch.format(second)), capture_output=True, text=True)
    waited = time.monotonic() - started
    _, err = held.communicate()

    assert waited > 1, f"the second dispatch did not wait for the first ({waited:.1f}s)"
    assert held.returncode == 0, err
    assert late.returncode != 0, late.stdout
    assert "Not enough stock to dispatch" in late.stderr, late.stderr
    assert _stock(api_client, world, listing_id) == 1
    assert len(_events(first)) == 1
    assert _events(second) == []
