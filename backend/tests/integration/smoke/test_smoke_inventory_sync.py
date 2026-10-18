"""B3 on the real stack: marketplace dispatch takes the dealer's stock from the IMS, once (SRDS §19-§21, §53.39; D5-D8;
docs/plan-inventory.md B3 exit).

A buyer orders through the real API from a dealer's listing linked to an inventory product, and the dealer moves the
order to dispatched through the A4 order route. The database does the rest in the dispatch transaction
(apply_order_dispatch → apply_dispatch_event, 20261022090000_inventory_sync.sql). These tests prove, reading the tables
as the database owner (inventory_world.sql), that:

* dispatch deducts once per line, as a ZARAILINK_ORDER movement carrying the order id and the order line id;
* replaying the dispatch (with or without an Idempotency-Key), replaying the event, a double click and two concurrent
  dispatches deduct exactly once; a cancelled order deducts nothing;
* when the IMS cannot apply an event the order still dispatches, the event waits in the dealer's sync log, and the
  dealer's retry applies it exactly once after they fix the cause;
* only the owning, approved dealer reads or retries their log.

The IMS outage is injected per dealer: a NOT VALID check constraint on inventory_movements refuses this one dealer's
ZARAILINK_ORDER rows, so inventory_apply_movement fails inside apply_dispatch_event exactly as any database failure
would, while every other dealer (and zl-db's pgTAP run on the same stack) is untouched. The constraint is dropped in a
`finally`. Nothing of our own is mocked: the API, the auth and the stock functions are the real ones.
"""

from __future__ import annotations

import os
import threading
import uuid
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager

import httpx
import pytest
from inventory_world import INV, Dealer, approved_dealer, ok, sql

ORDERS = "/api/v1/orders"
REST = os.environ.get("LOCAL_SUPABASE_URL", "") + "/rest/v1"
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")


# --- setup through the real API ---------------------------------------------------------------------------------------


@pytest.fixture
def fresh_dealer(world, backend_url, api_client):
    """A new approved dealer with one shop, their default location (the first location is the default, D8). Each test
    has its own dealer, so one test's pending event is never applied by another test's dispatch (apply_order_dispatch
    retries the seller's older pending events first)."""

    def make() -> Dealer:
        d = approved_dealer(backend_url, world.admin.token)
        shop = ok(api_client("POST", f"{INV}/locations", d.token, json={"name": f"Shop {uuid.uuid4().hex[:6]}"}), 201)
        assert shop["is_default"], shop
        d.ids["shop"] = shop["id"]
        return d

    return make


def _product(api_client, d: Dealer, stock: float, name: str = "Urea") -> str:
    run = uuid.uuid4().hex[:6]
    product = ok(
        api_client("POST", f"{INV}/products", d.token, json={"sku": f"SYNC-{run}", "name": f"{name} {run}"}), 201
    )
    if stock:
        _stock_in(api_client, d, product["id"], stock)
    return product["id"]


def _stock_in(api_client, d: Dealer, product_id: str, quantity: float) -> None:
    body = {"product_id": product_id, "location_id": d.ids["shop"], "quantity": quantity, "reason": "Restock"}
    ok(api_client("POST", f"{INV}/movements/stock-in", d.token, json=body), 201)


def _listing(api_client, world, d: Dealer, product_id: str | None, quantity: float = 100) -> str:
    """A listing of the dealer's, linked to `product_id` (D8) unless it is None. A linked listing's own quantity is
    not its stock; it is set high so that only the product's stock can decide."""
    listing = ok(
        api_client(
            "POST",
            "/api/v1/marketplace/listings",
            d.token,
            json={
                "title": f"Sync listing {uuid.uuid4().hex[:6]}",
                "price": 100.0,
                "unit": "bag",
                "quantity": quantity,
                "category_id": world.category_id,
                "brand": "Smoke",
                "condition": "new",
            },
        )
    )
    if product_id is not None:
        _link(api_client, d, product_id, listing["id"])
    return listing["id"]


def _link(api_client, d: Dealer, product_id: str, listing_id: str) -> None:
    ok(api_client("POST", f"{INV}/products/{product_id}/listings", d.token, json={"listing_id": listing_id}))


def _buy(api_client, buyer, *lines: tuple[str, float]) -> str:
    cart = [{"listing_id": listing_id, "quantity": quantity} for listing_id, quantity in lines]
    orders = ok(api_client("POST", f"{ORDERS}/checkout", buyer.token, json={"cart_items": cart}))
    assert len(orders) == 1, orders  # one seller, one order
    return orders[0]["id"]


def _move(api_client, actor, order_id: str, *steps: str, headers: dict | None = None) -> httpx.Response:
    response = None
    for step in steps:
        response = api_client(
            "PATCH", f"{ORDERS}/{order_id}/status", actor.token, json={"to": step}, headers=headers or {}
        )
        if response.status_code != 204:
            return response
    assert response is not None
    return response


def _ready(api_client, d: Dealer, order_id: str) -> None:
    assert _move(api_client, d, order_id, "confirmed", "processing", "ready").status_code == 204


def _dispatch(api_client, d: Dealer, order_id: str) -> None:
    response = _move(api_client, d, order_id, "dispatched")
    assert response.status_code == 204, response.text


def _together(backend_url: str, requests: list[tuple[str, str, dict]]) -> list[httpx.Response]:
    """Sends every (token, path, body) PATCH at the same moment, each from its own thread and connection."""
    barrier = threading.Barrier(len(requests))

    def send(request: tuple[str, str, dict]) -> httpx.Response:
        token, path, body = request
        with httpx.Client(base_url=backend_url, timeout=60) as client:
            barrier.wait()
            return client.patch(path, json=body, headers={"Authorization": f"Bearer {token}"})

    with ThreadPoolExecutor(max_workers=len(requests)) as pool:
        return list(pool.map(send, requests))


# --- reading the database as its owner --------------------------------------------------------------------------------


def _uuid(value: str) -> str:
    return str(uuid.UUID(value))  # every id below is interpolated into SQL; it must be a uuid


def _rows(statement: str) -> list[list[str]]:
    out = sql(statement)
    return [line.split("|") for line in out.splitlines()] if out else []


def _lines(order_id: str) -> dict[str, tuple[str, float]]:
    """The order's lines: order_item_id → (listing_id, quantity)."""
    rows = _rows(f"select id, listing_id, quantity from public.order_items where order_id = '{_uuid(order_id)}'")
    return {r[0]: (r[1], float(r[2])) for r in rows}


def _movements(order_id: str) -> list[dict]:
    """Every ledger row carrying this order's id."""
    rows = _rows(
        "select order_item_id, product_id, direction, source, quantity, coalesce(actor::text, '') "
        f"from public.inventory_movements where order_id = '{_uuid(order_id)}' order by created_at, id"
    )
    keys = ("order_item_id", "product_id", "direction", "source", "quantity", "actor")
    return [{**dict(zip(keys, r, strict=True)), "quantity": float(r[4])} for r in rows]


def _stock(product_id: str, location_id: str) -> float:
    return float(
        sql(
            "select coalesce(sum(quantity), 0) from public.inventory_stock "
            f"where product_id = '{_uuid(product_id)}' and location_id = '{_uuid(location_id)}'"
        )
    )


def _events(order_id: str) -> list[dict]:
    rows = _rows(
        "select id, order_item_id, inventory_applied_at is not null "
        f"from public.order_events where order_id = '{_uuid(order_id)}' order by id"
    )
    return [{"id": r[0], "order_item_id": r[1], "applied": r[2] == "t"} for r in rows]


def _log(order_id: str) -> list[dict]:
    """The sync-log rows of this order's events: status, attempts and error."""
    rows = _rows(
        "select s.id, s.order_event_id, s.status, s.attempts, coalesce(s.error, '') "
        "from public.inventory_sync_log s join public.order_events e on e.id = s.order_event_id "
        f"where e.order_id = '{_uuid(order_id)}' order by e.id"
    )
    return [{"id": r[0], "event": r[1], "status": r[2], "attempts": int(r[3]), "error": r[4]} for r in rows]


def _ledger_holds(product_id: str) -> None:
    """Every change of the product's stock is in the ledger: the stock equals the ins minus the outs (SRDS §24-§25)."""
    pid = _uuid(product_id)
    stock = float(sql(f"select coalesce(sum(quantity), 0) from public.inventory_stock where product_id = '{pid}'"))
    ledger = float(
        sql(
            "select coalesce(sum(case direction when 'in' then quantity else -quantity end), 0) "
            f"from public.inventory_movements where product_id = '{pid}'"
        )
    )
    assert stock == ledger, (stock, ledger)


def _every_order_movement_names_its_order(dealer_id: str) -> None:
    did = _uuid(dealer_id)
    orphans = sql(
        "select count(*) from public.inventory_movements "
        f"where dealer_id = '{did}' and source = 'ZARAILINK_ORDER' and (order_id is null or order_item_id is null)"
    )
    assert orphans == "0"


def _status(api_client, actor, order_id: str) -> str:
    return ok(api_client("GET", f"{ORDERS}/{order_id}", actor.token))["status"]


@contextmanager
def _ims_outage(dealer_id: str) -> Iterator[None]:
    """Makes the IMS refuse this one dealer's marketplace deductions until the block exits (see the module docstring).
    NOT VALID: the dealer's existing rows are not rechecked; only new ones are refused."""
    name = f"smoke_ims_outage_{uuid.uuid4().hex[:8]}"
    sql(
        "set lock_timeout = '20s'; "
        f"alter table public.inventory_movements add constraint {name} "
        f"check (dealer_id <> '{_uuid(dealer_id)}' or source <> 'ZARAILINK_ORDER') not valid"
    )
    try:
        yield
    finally:
        sql(f"alter table public.inventory_movements drop constraint if exists {name}")


def _sync_log(api_client, d: Dealer, status: str | None = None) -> list[dict]:
    path = f"{INV}/sync/log" + (f"?status={status}" if status else "")
    return ok(api_client("GET", path, d.token))


def _retry(api_client, d: Dealer) -> int:
    return ok(api_client("POST", f"{INV}/sync/retry", d.token))["applied"]


# --- dispatch deducts once per line -----------------------------------------------------------------------------------


def test_dispatch_takes_each_line_once_as_a_zarailink_order_movement_with_its_order_and_line(
    world, api_client, fresh_dealer
):
    d = fresh_dealer()
    urea, dap = _product(api_client, d, 10, "Urea"), _product(api_client, d, 6, "DAP")
    urea_listing, dap_listing = _listing(api_client, world, d, urea), _listing(api_client, world, d, dap)
    order_id = _buy(api_client, world.buyer, (urea_listing, 3), (dap_listing, 2))

    _ready(api_client, d, order_id)
    # D5: nothing leaves before dispatch
    assert (_stock(urea, d.ids["shop"]), _stock(dap, d.ids["shop"])) == (10, 6)
    assert _movements(order_id) == []
    assert _events(order_id) == []

    _dispatch(api_client, d, order_id)

    lines = _lines(order_id)
    moved = _movements(order_id)
    assert len(moved) == 2, moved
    product_of = {urea_listing: urea, dap_listing: dap}
    assert {m["order_item_id"] for m in moved} == set(lines)
    for m in moved:
        listing_id, quantity = lines[m["order_item_id"]]
        assert (m["source"], m["direction"]) == ("ZARAILINK_ORDER", "out")
        assert m["product_id"] == product_of[listing_id]
        assert m["quantity"] == quantity
    assert (_stock(urea, d.ids["shop"]), _stock(dap, d.ids["shop"])) == (7, 4)

    # one applied outbox event and one applied log row per line
    events = _events(order_id)
    assert sorted(e["order_item_id"] for e in events) == sorted(lines)
    assert all(e["applied"] for e in events)
    assert [(r["status"], r["attempts"]) for r in _log(order_id)] == [("applied", 1), ("applied", 1)]

    # the dealer sees it through the API: the log, and the movement with the order on it
    seen = {e["order_event_id"]: e["status"] for e in _sync_log(api_client, d)}
    assert {e["id"]: "applied" for e in events}.items() <= seen.items()
    ledger = ok(api_client("GET", f"{INV}/movements?product_id={urea}&source=ZARAILINK_ORDER", d.token))
    assert [(m["order_id"], m["quantity"]) for m in ledger] == [(order_id, 3.0)]

    for product_id in (urea, dap):
        _ledger_holds(product_id)
    _every_order_movement_names_its_order(d.id)


# --- replay, double click, concurrency, cancel ------------------------------------------------------------------------


def test_a_replayed_dispatch_or_event_deducts_nothing_more(world, api_client, fresh_dealer):
    d = fresh_dealer()
    product = _product(api_client, d, 10)
    listing = _listing(api_client, world, d, product)
    order_id = _buy(api_client, world.buyer, (listing, 4))
    _ready(api_client, d, order_id)

    key = {"Idempotency-Key": f"dispatch-{uuid.uuid4()}"}
    assert _move(api_client, d, order_id, "dispatched", headers=key).status_code == 204
    assert _stock(product, d.ids["shop"]) == 6

    # the same request again, with the same key and with none: no second deduction, never a server error
    for headers in (key, None):
        again = _move(api_client, d, order_id, "dispatched", headers=headers)
        assert again.status_code < 500, again.text
        assert again.status_code != 200, again.text
    assert _status(api_client, world.buyer, order_id) == "dispatched"

    # the event itself replayed, as a worker would after a crash: skipped, logged, nothing taken (SRDS §21)
    (event,) = _events(order_id)
    assert sql(f"select public.apply_dispatch_event('{_uuid(event['id'])}')") == "skipped_duplicate"
    # and the dealer's retry finds nothing pending
    assert _retry(api_client, d) == 0

    assert len(_movements(order_id)) == 1
    assert _stock(product, d.ids["shop"]) == 6
    (row,) = _log(order_id)
    assert row["status"] == "applied"  # an applied row never goes back
    _ledger_holds(product)


def test_a_double_click_on_dispatch_deducts_once(world, api_client, backend_url, fresh_dealer):
    d = fresh_dealer()
    product = _product(api_client, d, 10)
    listing = _listing(api_client, world, d, product)
    order_id = _buy(api_client, world.buyer, (listing, 4))
    _ready(api_client, d, order_id)

    clicks = _together(backend_url, [(d.token, f"{ORDERS}/{order_id}/status", {"to": "dispatched"})] * 2)

    codes = sorted(r.status_code for r in clicks)
    assert codes[0] == 204, [r.text for r in clicks]
    assert all(c < 500 for c in codes), [r.text for r in clicks]
    assert len(_movements(order_id)) == 1
    assert len(_events(order_id)) == 1
    assert _stock(product, d.ids["shop"]) == 6
    _ledger_holds(product)


def test_two_concurrent_dispatches_of_two_orders_each_deduct_once(world, api_client, backend_url, fresh_dealer):
    d = fresh_dealer()
    product = _product(api_client, d, 10)
    listing = _listing(api_client, world, d, product)
    first = _buy(api_client, world.buyer, (listing, 4))
    second = _buy(api_client, world.buyer2, (listing, 3))
    for order_id in (first, second):
        _ready(api_client, d, order_id)

    both = _together(
        backend_url,
        [(d.token, f"{ORDERS}/{order_id}/status", {"to": "dispatched"}) for order_id in (first, second)],
    )

    assert [r.status_code for r in both] == [204, 204], [r.text for r in both]
    assert [m["quantity"] for m in _movements(first)] == [4.0]
    assert [m["quantity"] for m in _movements(second)] == [3.0]
    assert _stock(product, d.ids["shop"]) == 3
    _ledger_holds(product)


def test_two_concurrent_dispatches_for_stock_that_fits_one_take_it_once(world, api_client, backend_url, fresh_dealer):
    """D6 under concurrency on the IMS stock: the second dispatch waits for the first's lock on the stock row, then sees
    the stock gone and is refused as a whole."""
    d = fresh_dealer()
    product = _product(api_client, d, 5)
    listing = _listing(api_client, world, d, product)
    first = _buy(api_client, world.buyer, (listing, 4))
    second = _buy(api_client, world.buyer2, (listing, 4))
    for order_id in (first, second):
        _ready(api_client, d, order_id)

    both = _together(
        backend_url,
        [(d.token, f"{ORDERS}/{order_id}/status", {"to": "dispatched"}) for order_id in (first, second)],
    )

    by_order = dict(zip((first, second), both, strict=True))
    won = [o for o, r in by_order.items() if r.status_code == 204]
    lost = [o for o, r in by_order.items() if r.status_code != 204]
    assert (len(won), len(lost)) == (1, 1), [r.text for r in both]
    refused = by_order[lost[0]]
    assert (refused.status_code, refused.json()["code"]) == (422, "insufficient_stock"), refused.text
    assert len(_movements(won[0])) == 1
    assert (_movements(lost[0]), _events(lost[0])) == ([], [])
    assert _status(api_client, d, lost[0]) == "ready"
    assert _stock(product, d.ids["shop"]) == 1
    _ledger_holds(product)


def test_an_order_cancelled_before_dispatch_deducts_nothing(world, api_client, fresh_dealer):
    d = fresh_dealer()
    product = _product(api_client, d, 8)
    listing = _listing(api_client, world, d, product)
    order_id = _buy(api_client, world.buyer, (listing, 3))
    assert _move(api_client, d, order_id, "confirmed").status_code == 204
    assert _move(api_client, world.buyer, order_id, "cancelled").status_code == 204

    late = _move(api_client, d, order_id, "processing", "ready", "dispatched")
    assert late.status_code == 422, late.text
    assert _status(api_client, d, order_id) == "cancelled"
    assert (_movements(order_id), _events(order_id), _log(order_id)) == ([], [], [])
    assert _stock(product, d.ids["shop"]) == 8


def test_a_listing_with_no_product_takes_its_own_quantity_and_leaves_nothing_pending(world, api_client, fresh_dealer):
    """D8: an unlinked listing sells its own quantity, as before the IMS; the IMS has nothing to apply, so there is no
    movement, no sync-log row and nothing for the retry."""
    d = fresh_dealer()
    listing = _listing(api_client, world, d, None, quantity=5)
    order_id = _buy(api_client, world.buyer, (listing, 2))
    _ready(api_client, d, order_id)
    _dispatch(api_client, d, order_id)

    assert ok(api_client("GET", f"/api/v1/marketplace/listings/{listing}", d.token))["quantity"] == 3
    assert [e["applied"] for e in _events(order_id)] == [True]
    assert (_movements(order_id), _log(order_id)) == ([], [])
    assert _retry(api_client, d) == 0


def test_two_lines_of_one_product_that_together_exceed_its_stock_refuse_the_dispatch(world, api_client, fresh_dealer):
    """D6: a known shortage refuses the dispatch. Two listings linked to one product share its stock, so an order whose
    lines need 8 of a product with 5 is short, even though each line alone (4) fits. Before the B3 fix the check ran per
    line: the dispatch went through, the first line took 4 and the second waited as 'Only 1.00 in stock'."""
    d = fresh_dealer()
    product = _product(api_client, d, 5)
    first, second = _listing(api_client, world, d, product), _listing(api_client, world, d, product)
    order_id = _buy(api_client, world.buyer, (first, 4), (second, 4))
    confirmed = _move(api_client, d, order_id, "confirmed", "processing", "ready")
    refused = _move(api_client, d, order_id, "dispatched") if confirmed.status_code == 204 else confirmed
    # Refusing it already at confirm is as good as at dispatch: nothing is taken either way.
    assert refused.status_code == 422, (
        f"dispatch answered {refused.status_code}; order {_status(api_client, d, order_id)}, "
        f"movements {_movements(order_id)}, sync log {_log(order_id)}, stock {_stock(product, d.ids['shop'])}"
    )
    assert refused.json()["code"] == "insufficient_stock", refused.text
    assert (_movements(order_id), _events(order_id)) == ([], [])
    assert _stock(product, d.ids["shop"]) == 5


# --- the IMS fails: the marketplace goes on, the event waits, the retry applies it once -------------------------------


def test_an_ims_outage_never_blocks_the_marketplace_and_the_dealers_retry_applies_the_event_once(
    world, api_client, fresh_dealer
):
    d, other = fresh_dealer(), fresh_dealer()
    product = _product(api_client, d, 10)
    listing = _listing(api_client, world, d, product)
    order_id = _buy(api_client, world.buyer, (listing, 4))
    _ready(api_client, d, order_id)
    (line,) = _lines(order_id)

    with _ims_outage(d.id):
        _dispatch(api_client, d, order_id)  # §53.39: the IMS failing never blocks the marketplace
        assert _status(api_client, world.buyer, order_id) == "dispatched"
        assert _stock(product, d.ids["shop"]) == 10
        assert _movements(order_id) == []
        (event,) = _events(order_id)
        assert not event["applied"]
        (row,) = _log(order_id)
        assert (row["status"], row["attempts"]) == ("failed", 1)
        assert row["error"]

        # the dealer sees the pending event, with the reason
        failed = _sync_log(api_client, d, "failed")
        assert [(e["order_event_id"], e["error"]) for e in failed] == [(event["id"], row["error"])]
        assert _sync_log(api_client, d, "applied") == []

        # the marketplace browses and takes orders meanwhile
        assert api_client("GET", f"/api/v1/marketplace/listings/{listing}").status_code == 200
        _buy(api_client, world.buyer2, (listing, 1))

        # a retry while the IMS still fails applies nothing and keeps the event pending
        assert _retry(api_client, d) == 0
        (row,) = _log(order_id)
        assert (row["status"], row["attempts"]) == ("failed", 2)

    # another dealer neither reads nor retries it
    assert event["id"] not in [e["order_event_id"] for e in _sync_log(api_client, other)]
    assert _retry(api_client, other) == 0
    assert _log(order_id) == [row]
    assert _stock(product, d.ids["shop"]) == 10

    # meanwhile the dealer sold 8 in the shop: the IMS is back, but the stock is short, so the retry still waits
    sale = {"product_id": product, "location_id": d.ids["shop"], "source": "LOCAL_SALE", "quantity": 8}
    ok(api_client("POST", f"{INV}/movements/stock-out", d.token, json=sale), 201)
    assert _retry(api_client, d) == 0
    (row,) = _log(order_id)
    assert (row["status"], row["attempts"]) == ("failed", 3)
    assert "Only 2.00 in stock" in row["error"], row
    assert _movements(order_id) == []

    # the dealer restocks, and the retry applies it exactly once
    _stock_in(api_client, d, product, 5)
    assert _retry(api_client, d) == 1
    moved = _movements(order_id)
    assert [(m["order_item_id"], m["source"], m["quantity"]) for m in moved] == [(line, "ZARAILINK_ORDER", 4.0)]
    assert _stock(product, d.ids["shop"]) == 3
    (row,) = _log(order_id)
    assert (row["status"], row["error"]) == ("applied", "")
    assert all(e["applied"] for e in _events(order_id))
    assert [e["order_event_id"] for e in _sync_log(api_client, d, "applied")] == [event["id"]]
    assert _sync_log(api_client, d, "failed") == []

    # a second retry applies nothing
    assert _retry(api_client, d) == 0
    assert len(_movements(order_id)) == 1
    assert _stock(product, d.ids["shop"]) == 3
    _ledger_holds(product)
    _every_order_movement_names_its_order(d.id)


def test_a_pending_event_is_applied_first_by_the_dealers_next_dispatch(world, api_client, fresh_dealer):
    """apply_order_dispatch retries the seller's older pending events before its own, so the ledger keeps dispatch
    order even if the dealer never presses retry."""
    d = fresh_dealer()
    product = _product(api_client, d, 10)
    listing = _listing(api_client, world, d, product)
    older = _buy(api_client, world.buyer, (listing, 2))
    newer = _buy(api_client, world.buyer2, (listing, 3))
    for order_id in (older, newer):
        _ready(api_client, d, order_id)

    with _ims_outage(d.id):
        _dispatch(api_client, d, older)
    assert _movements(older) == []

    _dispatch(api_client, d, newer)

    assert [m["quantity"] for m in _movements(older)] == [2.0]
    assert [m["quantity"] for m in _movements(newer)] == [3.0]
    # Both movements are written in one transaction, so created_at ties; the stock chain shows the order: the older
    # order took 10 -> 8, then the newer 8 -> 5.
    chain = _rows(
        "select order_id, quantity_before, quantity_after from public.inventory_movements "
        f"where product_id = '{_uuid(product)}' and source = 'ZARAILINK_ORDER' order by quantity_before desc"
    )
    assert [(r[0], float(r[1]), float(r[2])) for r in chain] == [(older, 10, 8), (newer, 8, 5)]
    assert _stock(product, d.ids["shop"]) == 5
    assert _retry(api_client, d) == 0
    _ledger_holds(product)


def test_a_deleted_product_keeps_the_event_pending_until_the_listing_is_linked_again(world, api_client, fresh_dealer):
    d = fresh_dealer()
    product = _product(api_client, d, 10)
    listing = _listing(api_client, world, d, product)
    order_id = _buy(api_client, world.buyer, (listing, 4))
    _ready(api_client, d, order_id)
    with _ims_outage(d.id):
        _dispatch(api_client, d, order_id)

    # the dealer deletes the product (it has history, so it is deactivated and its listing unlinked)
    deleted = api_client("DELETE", f"{INV}/products/{product}", d.token)
    assert deleted.status_code in (200, 204), deleted.text
    assert _retry(api_client, d) == 0
    (row,) = _log(order_id)
    assert (row["status"], row["error"]) == ("failed", "The listing is not linked to a product")
    assert _stock(product, d.ids["shop"]) == 10  # the deactivated product keeps its stock untouched

    # linking the listing to a product with stock fixes the cause; the retry applies it there, once
    replacement = _product(api_client, d, 10, "Urea replacement")
    _link(api_client, d, replacement, listing)
    assert _retry(api_client, d) == 1
    assert [(m["product_id"], m["quantity"]) for m in _movements(order_id)] == [(replacement, 4.0)]
    assert _stock(replacement, d.ids["shop"]) == 6
    assert _retry(api_client, d) == 0
    assert len(_movements(order_id)) == 1
    for product_id in (product, replacement):
        _ledger_holds(product_id)


def test_the_default_location_cannot_be_deactivated_so_dispatch_always_has_one(world, api_client, fresh_dealer):
    """Once a dealer has a location, the 'no default location' failure cannot arise: the default stays active and
    present (20261025090000_purchase_atomic_writes.sql, F7), and dispatch keeps applying."""
    d = fresh_dealer()
    product = _product(api_client, d, 10)
    listing = _listing(api_client, world, d, product)
    refused = api_client("PATCH", f"{INV}/locations/{d.ids['shop']}", d.token, json={"is_active": False})
    assert (refused.status_code, refused.json()["code"]) == (409, "conflict"), refused.text
    deleted = api_client("DELETE", f"{INV}/locations/{d.ids['shop']}", d.token)
    assert deleted.status_code == 409, deleted.text

    order_id = _buy(api_client, world.buyer, (listing, 1))
    _ready(api_client, d, order_id)
    _dispatch(api_client, d, order_id)
    assert [r["status"] for r in _log(order_id)] == ["applied"]
    assert _stock(product, d.ids["shop"]) == 9


def test_a_dealer_with_no_location_dispatches_and_the_line_waits_until_they_stock_the_product(
    world, api_client, backend_url
):
    """A dealer who links a listing to a product before setting up any location has no known stock: not a known
    shortage, so the dispatch goes ahead (§53.39, D7) and the line waits as 'No default location'. The real path: the
    order is confirmed while the listing sells its own quantity, then the dealer links it to a new, empty product."""
    d = approved_dealer(backend_url, world.admin.token)
    listing = _listing(api_client, world, d, None, quantity=10)
    order_id = _buy(api_client, world.buyer, (listing, 4))
    _ready(api_client, d, order_id)
    product = _product(api_client, d, 0)
    _link(api_client, d, product, listing)
    assert ok(api_client("GET", f"{INV}/locations", d.token)) == []

    _dispatch(api_client, d, order_id)
    assert _status(api_client, world.buyer, order_id) == "dispatched"
    (row,) = _log(order_id)
    assert (row["status"], row["error"]) == ("failed", "No default location")
    assert [(e["order_event_id"], e["error"]) for e in _sync_log(api_client, d, "failed")] == [
        (row["event"], "No default location")
    ]
    assert _movements(order_id) == []
    # the listing's own quantity was not taken either: the line belongs to the product now
    assert ok(api_client("GET", f"/api/v1/marketplace/listings/{listing}", d.token))["quantity"] == 10

    # the dealer sets up their shop (the first location is the default) and stocks the product; the retry applies once
    shop = ok(api_client("POST", f"{INV}/locations", d.token, json={"name": "First shop"}), 201)
    d.ids["shop"] = shop["id"]
    assert _retry(api_client, d) == 0  # a default, but no stock yet: still waiting
    (row,) = _log(order_id)
    assert row["status"] == "failed"
    assert "Only 0.00 in stock" in row["error"], row
    _stock_in(api_client, d, product, 6)
    assert _retry(api_client, d) == 1
    assert [(m["product_id"], m["quantity"]) for m in _movements(order_id)] == [(product, 4.0)]
    assert _stock(product, shop["id"]) == 2
    assert [r["status"] for r in _log(order_id)] == ["applied"]
    assert _retry(api_client, d) == 0
    _ledger_holds(product)


# --- who reaches the log ----------------------------------------------------------------------------------------------


def _rest(method: str, path: str, token: str, **kw) -> httpx.Response:
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}
    return httpx.request(method, f"{REST}/{path}", headers=headers, timeout=30, **kw)


def test_only_the_owning_approved_dealer_reads_or_retries_the_sync_log(world, api_client, fresh_dealer, make_applicant):
    owner, other = fresh_dealer(), fresh_dealer()
    product = _product(api_client, owner, 10)
    listing = _listing(api_client, world, owner, product)
    order_id = _buy(api_client, world.buyer, (listing, 4))
    _ready(api_client, owner, order_id)
    with _ims_outage(owner.id):
        _dispatch(api_client, owner, order_id)
    (event,) = _events(order_id)
    before = _log(order_id)
    assert [r["status"] for r in before] == ["failed"]

    # allowed: the owner reads their pending event
    assert event["id"] in [e["order_event_id"] for e in _sync_log(api_client, owner, "failed")]
    assert [r["order_event_id"] for r in _rest("GET", "inventory_sync_log?select=*", owner.token).json()] == [
        event["id"]
    ]

    # refused: another approved dealer sees none of it, through the API or PostgREST, and their retry touches nothing
    assert _sync_log(api_client, other) == []
    assert _rest("GET", f"inventory_sync_log?dealer_id=eq.{owner.id}", other.token).json() == []
    assert _retry(api_client, other) == 0

    # refused by role or approval: a pending dealer, the admin, a farmer, a buyer, an expert; and no one signed in
    _, _, pending_token = make_applicant("dealer")
    refusals = [
        (pending_token, "account_not_approved"),
        (world.admin.token, "insufficient_role"),
        (world.farmer.token, "insufficient_role"),
        (world.buyer.token, "insufficient_role"),
        (world.expert.token, "insufficient_role"),
    ]
    for token, code in refusals:
        for method, path in (("GET", f"{INV}/sync/log"), ("POST", f"{INV}/sync/retry")):
            refused = api_client(method, path, token)
            assert (refused.status_code, refused.json()["code"]) == (403, code), (path, refused.text)
        # PostgREST: the table reads empty, and the retry function refuses (inventory_caller, 42501)
        assert _rest("GET", f"inventory_sync_log?dealer_id=eq.{owner.id}", token).json() == []
        rpc = _rest("POST", "rpc/retry_dispatch_events", token, json={})
        assert rpc.status_code in (401, 403), rpc.text
    for method, path in (("GET", f"{INV}/sync/log"), ("POST", f"{INV}/sync/retry")):
        assert api_client(method, path).status_code == 401

    # none of that changed the owner's log or stock
    assert _log(order_id) == before
    assert _stock(product, owner.ids["shop"]) == 10

    # and the owner's own retry, once the IMS is back, is the one that applies it
    assert _retry(api_client, owner) == 1
    assert [r["status"] for r in _log(order_id)] == ["applied"]
    assert _stock(product, owner.ids["shop"]) == 6
