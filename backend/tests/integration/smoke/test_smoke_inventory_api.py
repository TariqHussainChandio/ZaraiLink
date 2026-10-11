"""B2 on the real stack: the dealer Inventory API does what SRDS §17-§18 and §22-§24 say (docs/plan-inventory.md, B2).

Each test drives a real approved dealer through the real API and the local database: products and SKUs, locations
and stock, the movements (receive, adjust, transfer, damage, local sale, and a customer return recorded as Stock In),
suppliers and purchases, alerts and settings, the dashboard, and the legacy dealer routes served from the IMS tables.
Stock moves only through movements, so after every operation the stock on hand equals the ledger's signed sum and each
movement's `quantity_before` is the previous one's `quantity_after`. Who may call these routes is
test_smoke_inventory_isolation.py's subject.
"""

from __future__ import annotations

import itertools
from collections import defaultdict
from datetime import UTC, datetime, timedelta

import pytest
from inventory_world import INV, Dealer, approved_dealer, count_rows, fingerprint, ok, sql

DEALER = "/api/v1/dealer"


@pytest.fixture(scope="module")
def dealer(world, backend_url) -> Dealer:
    return approved_dealer(backend_url, world.admin.token)


@pytest.fixture
def fresh_dealer(world, backend_url):
    """A dealer with no inventory rows at all, for figures that must be exact."""
    return lambda: approved_dealer(backend_url, world.admin.token)


def _post(api_client, d: Dealer, path: str, body: dict, status: int = 201):
    return ok(api_client("POST", f"{INV}{path}", d.token, json=body), status)


def _raw(api_client, d: Dealer, path: str, raw_json: str):
    """A body that is not strict JSON (NaN, Infinity), as a careless client might send it."""
    return api_client(
        "POST", f"{INV}{path}", d.token, content=raw_json.encode(), headers={"Content-Type": "application/json"}
    )


def _location(api_client, d: Dealer, name: str, **extra) -> dict:
    return _post(api_client, d, "/locations", {"name": name, **extra})


def _product(api_client, d: Dealer, sku: str, **extra) -> dict:
    return _post(api_client, d, "/products", {"sku": sku, "name": f"Product {sku}", "unit": "bag", **extra})


def _movements(api_client, d: Dealer, query: str = "") -> list[dict]:
    rows: list[dict] = []
    offset = 0
    while True:
        sep = "&" if query else ""
        page = ok(api_client("GET", f"{INV}/movements?{query}{sep}limit=100&offset={offset}", d.token))
        rows.extend(page)
        if len(page) < 100:
            return rows
        offset += 100


def _stock(api_client, d: Dealer, product_id: str) -> dict[str, float]:
    rows = ok(api_client("GET", f"{INV}/stock?product_id={product_id}", d.token))
    return {r["location_id"]: r["quantity"] for r in rows}


def assert_ledger_explains_stock(api_client, d: Dealer, product_id: str) -> None:
    """SRDS §24-§25 per location: on hand = signed sum of the ledger, and the movements chain without a gap."""
    movements = sorted(_movements(api_client, d, f"product_id={product_id}"), key=lambda m: (m["created_at"], m["id"]))
    by_location: dict[str, list[dict]] = defaultdict(list)
    for m in movements:
        by_location[m["location_id"]].append(m)
    stock = _stock(api_client, d, product_id)
    assert set(by_location) <= set(stock), (by_location.keys(), stock)
    for location_id, rows in by_location.items():
        signed = round(sum(m["quantity"] if m["direction"] == "in" else -m["quantity"] for m in rows), 2)
        assert signed == stock[location_id], f"ledger {signed} != stock {stock[location_id]} at {location_id}"
        assert rows[0]["quantity_before"] == 0
        for previous, current in itertools.pairwise(rows):
            assert current["quantity_before"] == previous["quantity_after"], (previous, current)
        for m in rows:
            delta = m["quantity"] if m["direction"] == "in" else -m["quantity"]
            assert round(m["quantity_before"] + delta, 2) == m["quantity_after"], m


# --- products and SKUs ------------------------------------------------------------------------------------------------


def test_products_and_skus(api_client, dealer, world):
    d = dealer
    ok(api_client("PUT", f"{INV}/alerts/settings", d.token, json={"default_reorder_threshold": 4}))

    # without its own threshold a product takes the dealer's default; with one it keeps its own
    seed = _product(api_client, d, "SEED-1", cost_price=1200.5, selling_price=1450)
    assert seed["reorder_threshold"] == 4
    assert seed["total_quantity"] == 0
    assert seed["stock"] == []
    assert seed["listings"] == []
    own = _product(api_client, d, "SEED-2", reorder_threshold=0)
    assert own["reorder_threshold"] == 0

    # a SKU is unique per dealer
    duplicate = api_client("POST", f"{INV}/products", d.token, json={"sku": "SEED-1", "name": "Again"})
    assert duplicate.status_code == 409, duplicate.text

    # prices and thresholds keep two decimals, and are refused rather than rounded beyond that
    for bad in ({"cost_price": 10.555}, {"selling_price": -1}, {"reorder_threshold": 0.001}, {"unit": ""}):
        refused = api_client("POST", f"{INV}/products", d.token, json={"sku": "BAD", "name": "Bad", **bad})
        assert refused.status_code == 422, (bad, refused.text)
    for literal in ("NaN", "Infinity", "-Infinity"):
        refused = _raw(api_client, d, "/products", f'{{"sku": "BAD", "name": "Bad", "cost_price": {literal}}}')
        assert refused.status_code == 422, (literal, refused.text)
    assert not [p for p in ok(api_client("GET", f"{INV}/products", d.token)) if p["sku"] == "BAD"]

    got = ok(api_client("GET", f"{INV}/products/{seed['id']}", d.token))
    assert got["cost_price"] == 1200.5
    assert got["selling_price"] == 1450
    patched = ok(
        api_client(
            "PATCH", f"{INV}/products/{seed['id']}", d.token, json={"name": "Seed wheat", "reorder_threshold": 7}
        )
    )
    assert patched["name"] == "Seed wheat"
    assert patched["reorder_threshold"] == 7
    assert api_client("PATCH", f"{INV}/products/{seed['id']}", d.token, json={"cost_price": 1.234}).status_code == 422

    # link one of the dealer's own listings, then unlink it
    listing = ok(
        api_client(
            "POST",
            "/api/v1/marketplace/listings",
            d.token,
            json={
                "title": "Seed wheat 40kg",
                "price": 1450.0,
                "unit": "bag",
                "quantity": 1,
                "category_id": world.category_id,
                "brand": "Smoke",
                "condition": "new",
            },
        )
    )
    linked = ok(
        api_client("POST", f"{INV}/products/{seed['id']}/listings", d.token, json={"listing_id": listing["id"]})
    )
    assert [entry["id"] for entry in linked["listings"]] == [listing["id"]]
    # a listing that is not the dealer's (the farmer's) cannot be linked
    foreign = api_client(
        "POST", f"{INV}/products/{seed['id']}/listings", d.token, json={"listing_id": world.farmer_listing_id}
    )
    assert foreign.status_code == 404, foreign.text
    unlinked = ok(api_client("DELETE", f"{INV}/products/{seed['id']}/listings/{listing['id']}", d.token))
    assert unlinked["listings"] == []
    again = api_client("DELETE", f"{INV}/products/{seed['id']}/listings/{listing['id']}", d.token)
    assert again.status_code == 404

    # a product with no history is deleted; one with history is only deactivated (the ledger stays whole)
    assert api_client("DELETE", f"{INV}/products/{own['id']}", d.token).status_code == 204
    assert api_client("GET", f"{INV}/products/{own['id']}", d.token).status_code == 404
    shop = _location(api_client, d, "Products shop")
    _post(api_client, d, "/movements/stock-in", {"product_id": seed["id"], "location_id": shop["id"], "quantity": 2})
    assert api_client("DELETE", f"{INV}/products/{seed['id']}", d.token).status_code == 204
    kept = ok(api_client("GET", f"{INV}/products/{seed['id']}", d.token))
    assert kept["is_active"] is False
    assert kept["total_quantity"] == 2
    assert seed["id"] not in [p["id"] for p in ok(api_client("GET", f"{INV}/products", d.token))]
    assert seed["id"] in [p["id"] for p in ok(api_client("GET", f"{INV}/products?include_inactive=true", d.token))]
    assert len(_movements(api_client, d, f"product_id={seed['id']}")) == 1


# --- stock and locations ----------------------------------------------------------------------------------------------


def test_locations_and_the_default(api_client, fresh_dealer):
    d = fresh_dealer()
    # the first location is the default whatever was asked; the next is not unless asked
    first = _location(api_client, d, "Shop", is_default=False)
    second = _location(api_client, d, "Godown", kind="godown")
    assert first["is_default"] is True
    assert second["is_default"] is False

    # a default location must be active: neither created nor made inactive as one
    refused = api_client(
        "POST", f"{INV}/locations", d.token, json={"name": "Shut", "is_default": True, "is_active": False}
    )
    assert refused.status_code == 409, refused.text
    assert [loc["name"] for loc in ok(api_client("GET", f"{INV}/locations", d.token))] == ["Godown", "Shop"]
    for body in ({"is_active": False}, {"is_default": False}):
        assert api_client("PATCH", f"{INV}/locations/{first['id']}", d.token, json=body).status_code == 409
    assert api_client("DELETE", f"{INV}/locations/{first['id']}", d.token).status_code == 409
    inactive = ok(api_client("PATCH", f"{INV}/locations/{second['id']}", d.token, json={"is_active": False}))
    assert inactive["is_active"] is False
    promote_inactive = api_client("PATCH", f"{INV}/locations/{second['id']}", d.token, json={"is_default": True})
    assert promote_inactive.status_code == 409, promote_inactive.text
    ok(api_client("PATCH", f"{INV}/locations/{second['id']}", d.token, json={"is_active": True}))

    # moving the default leaves exactly one
    moved = ok(
        api_client(
            "PATCH", f"{INV}/locations/{second['id']}", d.token, json={"is_default": True, "name": "Main godown"}
        )
    )
    assert moved["is_default"] is True
    assert moved["name"] == "Main godown"
    locations = ok(api_client("GET", f"{INV}/locations", d.token))
    assert [loc["id"] for loc in locations if loc["is_default"]] == [second["id"]]
    assert ok(api_client("GET", f"{INV}/locations/{first['id']}", d.token))["is_default"] is False

    # a location with no history is deleted; one with stock history is deactivated
    empty = _location(api_client, d, "Spare shelf", kind="shelf")
    assert api_client("DELETE", f"{INV}/locations/{empty['id']}", d.token).status_code == 204
    assert api_client("GET", f"{INV}/locations/{empty['id']}", d.token).status_code == 404
    product = _product(api_client, d, "LOC-1")
    _post(
        api_client, d, "/movements/stock-in", {"product_id": product["id"], "location_id": first["id"], "quantity": 1}
    )
    assert api_client("DELETE", f"{INV}/locations/{first['id']}", d.token).status_code == 204
    assert ok(api_client("GET", f"{INV}/locations/{first['id']}", d.token))["is_active"] is False
    active = ok(api_client("GET", f"{INV}/locations?include_inactive=false", d.token))
    assert first["id"] not in [loc["id"] for loc in active]

    # stock reads by product and by location
    by_location = ok(api_client("GET", f"{INV}/stock?location_id={first['id']}", d.token))
    assert [(r["product_id"], r["quantity"]) for r in by_location] == [(product["id"], 1)]
    assert ok(api_client("GET", f"{INV}/stock?location_id={second['id']}", d.token)) == []


# --- movements and the ledger -----------------------------------------------------------------------------------------


def test_stock_moves_only_through_movements_and_the_ledger_explains_it(api_client, dealer):
    d = dealer
    shop = _location(api_client, d, "Ledger shop")
    godown = _location(api_client, d, "Ledger godown", kind="godown")
    product = _product(api_client, d, "LEDGER-1", cost_price=100)
    pid, s, g = product["id"], shop["id"], godown["id"]
    base = {"product_id": pid, "location_id": s}

    received = _post(api_client, d, "/movements/stock-in", {**base, "quantity": 20, "reason": "Delivery"})
    assert (received["source"], received["direction"], received["quantity_before"], received["quantity_after"]) == (
        "RESTOCK",
        "in",
        0,
        20,
    )
    assert received["actor"] == d.id
    adjusted = _post(
        api_client, d, "/movements/adjustment", {**base, "direction": "out", "quantity": 3, "reason": "Count"}
    )
    assert (adjusted["source"], adjusted["quantity_after"]) == ("MANUAL_ADJUSTMENT", 17)
    halves = _post(
        api_client,
        d,
        "/stock/transfer",
        {"product_id": pid, "from_location_id": s, "to_location_id": g, "quantity": 5, "reason": "To godown"},
    )
    assert sorted((m["location_id"], m["direction"]) for m in halves) == sorted([(s, "out"), (g, "in")])
    assert {m["source"] for m in halves} == {"TRANSFER"}
    assert len({m["transfer_id"] for m in halves}) == 1
    damaged = _post(api_client, d, "/movements/stock-out", {**base, "source": "DAMAGE", "quantity": 2, "reason": "Wet"})
    assert (damaged["source"], damaged["direction"], damaged["quantity_after"]) == ("DAMAGE", "out", 10)
    sold = _post(api_client, d, "/movements/stock-out", {**base, "source": "LOCAL_SALE", "quantity": 1.5})
    assert sold["quantity_after"] == 8.5
    # SRDS §24 has no return source: a customer's return comes back in as Stock In with its reason
    returned = _post(api_client, d, "/movements/stock-in", {**base, "quantity": 1.25, "reason": "Returned by customer"})
    assert (returned["source"], returned["quantity_after"], returned["reason"]) == (
        "RESTOCK",
        9.75,
        "Returned by customer",
    )
    expired = _post(
        api_client,
        d,
        "/movements/stock-out",
        {"product_id": pid, "location_id": g, "source": "EXPIRY", "quantity": 0.75, "reason": "Expired"},
    )
    assert expired["quantity_after"] == 4.25

    assert _stock(api_client, d, pid) == {s: 9.75, g: 4.25}
    assert_ledger_explains_stock(api_client, d, pid)
    ledger_size = count_rows("inventory_movements", d.id)

    # refused changes write nothing and move nothing
    refusals = [
        ("/movements/stock-out", {**base, "source": "LOCAL_SALE", "quantity": 100}, "insufficient_stock"),
        (
            "/stock/transfer",
            {"product_id": pid, "from_location_id": g, "to_location_id": s, "quantity": 5},
            "insufficient_stock",
        ),
        (
            "/movements/adjustment",
            {**base, "direction": "out", "quantity": 10, "reason": "Count"},
            "insufficient_stock",
        ),
        (
            "/stock/transfer",
            {"product_id": pid, "from_location_id": s, "to_location_id": s, "quantity": 1},
            "validation_failed",
        ),
        ("/movements/stock-out", {**base, "source": "DAMAGE", "quantity": 1}, None),
        ("/movements/stock-out", {**base, "source": "OTHER", "quantity": 1, "reason": "   "}, None),
        ("/movements/stock-out", {**base, "source": "RESTOCK", "quantity": 1}, None),
        ("/movements/adjustment", {**base, "direction": "in", "quantity": 1, "reason": ""}, None),
        ("/movements/adjustment", {**base, "direction": "in", "quantity": 1, "reason": "  "}, None),
        ("/movements/stock-in", {**base, "quantity": 1.255}, None),
        ("/movements/stock-in", {**base, "quantity": 0}, None),
        ("/movements/stock-in", {**base, "quantity": -4}, None),
        ("/movements/stock-in", {**base, "quantity": 10_000_000_000}, None),
        ("/stock/transfer", {"product_id": pid, "from_location_id": s, "to_location_id": g, "quantity": 0.001}, None),
    ]
    for path, body, code in refusals:
        response = api_client("POST", f"{INV}{path}", d.token, json=body)
        assert response.status_code == 422, (path, body, response.text)
        if code:
            assert response.json()["code"] == code, response.text
    for literal in ("NaN", "Infinity", "-Infinity", "1e400"):
        response = _raw(
            api_client,
            d,
            "/movements/stock-in",
            f'{{"product_id": "{pid}", "location_id": "{s}", "quantity": {literal}}}',
        )
        assert response.status_code == 422, (literal, response.text)
    shortage = api_client(
        "POST", f"{INV}/movements/stock-out", d.token, json={**base, "source": "LOCAL_SALE", "quantity": 100}
    ).json()
    assert "9.75" in shortage["title"], shortage  # the function's own message reaches the dealer
    assert count_rows("inventory_movements", d.id) == ledger_size
    assert _stock(api_client, d, pid) == {s: 9.75, g: 4.25}

    # the ledger's filters
    assert {m["source"] for m in _movements(api_client, d, f"product_id={pid}&source=DAMAGE&source=EXPIRY")} == {
        "DAMAGE",
        "EXPIRY",
    }
    outs = _movements(api_client, d, f"product_id={pid}&direction=out")
    assert outs
    assert {m["direction"] for m in outs} == {"out"}
    assert {m["location_id"] for m in _movements(api_client, d, f"product_id={pid}&location_id={g}")} == {g}
    today = datetime.now(UTC).date()
    assert len(_movements(api_client, d, f"product_id={pid}&from={today}&to={today}")) == 8
    assert _movements(api_client, d, f"product_id={pid}&from={today + timedelta(days=1)}") == []
    assert _movements(api_client, d, f"product_id={pid}&to={today - timedelta(days=1)}") == []
    newest_first = _movements(api_client, d, f"product_id={pid}")
    assert [m["created_at"] for m in newest_first] == sorted((m["created_at"] for m in newest_first), reverse=True)
    one = ok(api_client("GET", f"{INV}/movements/{received['id']}", d.token))
    assert one == received
    assert api_client("GET", f"{INV}/movements?source=NOT_A_SOURCE", d.token).status_code == 422

    # the database holds exactly the eight ledger rows the API reported
    assert sql(f"select count(*) from public.inventory_movements where product_id = '{pid}'") == "8"


def test_movement_lists_are_paged(api_client, fresh_dealer):
    d = fresh_dealer()
    shop = _location(api_client, d, "Paged shop")
    product = _product(api_client, d, "PAGE-1")
    for quantity in (1, 2, 3, 4, 5):
        _post(
            api_client,
            d,
            "/movements/stock-in",
            {"product_id": product["id"], "location_id": shop["id"], "quantity": quantity},
        )
    first = api_client("GET", f"{INV}/movements?limit=2", d.token)
    assert len(ok(first)) == 2
    assert 'rel="next"' in first.headers["link"]
    second = ok(api_client("GET", f"{INV}/movements?limit=2&offset=2", d.token))
    last = api_client("GET", f"{INV}/movements?limit=2&offset=4", d.token)
    assert len(ok(last)) == 1
    assert "link" not in last.headers
    seen = [m["id"] for m in ok(first) + second + ok(last)]
    assert len(set(seen)) == 5
    assert [m["quantity"] for m in ok(first) + second + ok(last)] == [5, 4, 3, 2, 1]
    for bad in ("limit=0", "limit=101", "offset=-1"):
        assert api_client("GET", f"{INV}/movements?{bad}", d.token).status_code == 422
    products = api_client("GET", f"{INV}/products?limit=1", d.token)
    assert len(ok(products)) == 1
    assert 'rel="next"' in products.headers["link"]


# --- suppliers and purchases ------------------------------------------------------------------------------------------


def test_suppliers(api_client, dealer):
    d = dealer
    supplier = _post(api_client, d, "/suppliers", {"name": "Fauji depot", "contact": "0300-0000000"})
    assert supplier["is_active"] is True
    assert api_client("POST", f"{INV}/suppliers", d.token, json={"name": ""}).status_code == 422
    patched = ok(api_client("PATCH", f"{INV}/suppliers/{supplier['id']}", d.token, json={"is_active": False}))
    assert patched["is_active"] is False
    assert patched["contact"] == "0300-0000000"
    assert ok(api_client("PATCH", f"{INV}/suppliers/{supplier['id']}", d.token, json={}))["id"] == supplier["id"]
    assert supplier["id"] in [x["id"] for x in ok(api_client("GET", f"{INV}/suppliers", d.token))]
    assert supplier["id"] not in [
        x["id"] for x in ok(api_client("GET", f"{INV}/suppliers?include_inactive=false", d.token))
    ]
    assert ok(api_client("GET", f"{INV}/suppliers/{supplier['id']}", d.token))["name"] == "Fauji depot"
    assert api_client("DELETE", f"{INV}/suppliers/{supplier['id']}", d.token).status_code == 204
    assert api_client("GET", f"{INV}/suppliers/{supplier['id']}", d.token).status_code == 404


def test_a_received_purchase_moves_stock_once(api_client, dealer):
    d = dealer
    shop = _location(api_client, d, "Purchase shop")
    godown = _location(api_client, d, "Purchase godown", kind="godown")
    urea = _product(api_client, d, "PO-UREA")
    dap = _product(api_client, d, "PO-DAP")
    supplier = _post(api_client, d, "/suppliers", {"name": "Engro depot"})

    draft = _post(
        api_client,
        d,
        "/purchases",
        {
            "supplier_id": supplier["id"],
            "reference": "INV-77",
            "purchased_on": "2026-10-01",
            "items": [{"product_id": urea["id"], "location_id": shop["id"], "quantity": 10, "unit_cost": 3400}],
        },
    )
    assert draft["status"] == "draft"
    assert draft["purchased_on"] == "2026-10-01"
    assert len(draft["items"]) == 1
    # a draft moves no stock
    assert _stock(api_client, d, urea["id"]) == {}

    # a draft is edited freely; three decimals are refused, not rounded
    too_fine = api_client(
        "PATCH",
        f"{INV}/purchases/{draft['id']}",
        d.token,
        json={"items": [{"product_id": urea["id"], "location_id": shop["id"], "quantity": 2.505}]},
    )
    assert too_fine.status_code == 422, too_fine.text
    edited = ok(
        api_client(
            "PATCH",
            f"{INV}/purchases/{draft['id']}",
            d.token,
            json={
                "notes": "Second truck",
                "items": [
                    {"product_id": urea["id"], "location_id": shop["id"], "quantity": 10, "unit_cost": 3400},
                    {"product_id": dap["id"], "location_id": godown["id"], "quantity": 4.5, "unit_cost": 9800.75},
                ],
            },
        )
    )
    assert edited["notes"] == "Second truck"
    assert len(edited["items"]) == 2
    assert draft["id"] in [p["id"] for p in ok(api_client("GET", f"{INV}/purchases?status=draft", d.token))]

    received = ok(api_client("POST", f"{INV}/purchases/{draft['id']}/receive", d.token))
    assert received["status"] == "received"
    assert received["received_at"]
    assert _stock(api_client, d, urea["id"]) == {shop["id"]: 10}
    assert _stock(api_client, d, dap["id"]) == {godown["id"]: 4.5}
    movements = [m for m in _movements(api_client, d, "source=PURCHASE") if m["purchase_id"] == draft["id"]]
    assert sorted((m["product_id"], m["quantity"]) for m in movements) == sorted([(urea["id"], 10), (dap["id"], 4.5)])
    ledger_size = count_rows("inventory_movements", d.id)

    # receiving again, editing or cancelling a received purchase changes nothing; all three are 409 invalid_transition
    again = api_client("POST", f"{INV}/purchases/{draft['id']}/receive", d.token)
    assert again.status_code == 409, again.text
    assert again.json()["code"] == "invalid_transition", again.text
    assert "already received" in again.json()["title"], again.text
    assert api_client("PATCH", f"{INV}/purchases/{draft['id']}", d.token, json={"notes": "x"}).status_code == 409
    assert api_client("POST", f"{INV}/purchases/{draft['id']}/cancel", d.token).status_code == 409
    assert count_rows("inventory_movements", d.id) == ledger_size
    assert _stock(api_client, d, urea["id"]) == {shop["id"]: 10}
    assert_ledger_explains_stock(api_client, d, urea["id"])
    assert_ledger_explains_stock(api_client, d, dap["id"])

    # a cancelled draft never moves stock; an empty draft cannot be received
    cancelled = _post(
        api_client, d, "/purchases", {"items": [{"product_id": urea["id"], "location_id": shop["id"], "quantity": 1}]}
    )
    assert ok(api_client("POST", f"{INV}/purchases/{cancelled['id']}/cancel", d.token))["status"] == "cancelled"
    assert api_client("POST", f"{INV}/purchases/{cancelled['id']}/receive", d.token).status_code == 409
    empty = _post(api_client, d, "/purchases", {"reference": "EMPTY"})
    assert api_client("POST", f"{INV}/purchases/{empty['id']}/receive", d.token).status_code == 422
    assert count_rows("inventory_movements", d.id) == ledger_size

    # a purchase keeps its record when its supplier is deleted
    assert api_client("DELETE", f"{INV}/suppliers/{supplier['id']}", d.token).status_code == 204
    assert ok(api_client("GET", f"{INV}/purchases/{draft['id']}", d.token))["supplier_id"] is None


# --- alerts and settings ----------------------------------------------------------------------------------------------


def test_alerts_and_settings(api_client, fresh_dealer):
    d = fresh_dealer()
    # a read before any save shows the defaults and writes nothing
    defaults = ok(api_client("GET", f"{INV}/alerts/settings", d.token))
    assert defaults == {
        "dealer_id": d.id,
        "default_reorder_threshold": 0,
        "notify_low_stock": True,
        "notify_sync_failure": True,
        "updated_at": None,
    }
    assert count_rows("inventory_alert_settings", d.id) == 0
    for bad in ({"default_reorder_threshold": -1}, {"default_reorder_threshold": 1.005}):
        assert api_client("PUT", f"{INV}/alerts/settings", d.token, json=bad).status_code == 422
    saved = ok(
        api_client(
            "PUT", f"{INV}/alerts/settings", d.token, json={"default_reorder_threshold": 3, "notify_low_stock": False}
        )
    )
    assert saved["default_reorder_threshold"] == 3
    assert saved["notify_low_stock"] is False
    assert saved["updated_at"]
    assert ok(api_client("GET", f"{INV}/alerts/settings", d.token)) == saved

    shop = _location(api_client, d, "Alert shop")
    godown = _location(api_client, d, "Alert godown", kind="godown")
    low = _product(api_client, d, "AL-LOW", reorder_threshold=5)
    out = _product(api_client, d, "AL-OUT", reorder_threshold=1)
    fine = _product(api_client, d, "AL-OK", reorder_threshold=5)
    # only the default location counts (the marketplace sells from it, D8): stock in the godown does not help
    _post(api_client, d, "/movements/stock-in", {"product_id": low["id"], "location_id": shop["id"], "quantity": 3})
    _post(api_client, d, "/movements/stock-in", {"product_id": out["id"], "location_id": godown["id"], "quantity": 50})
    _post(api_client, d, "/movements/stock-in", {"product_id": fine["id"], "location_id": shop["id"], "quantity": 6})

    alerts = ok(api_client("GET", f"{INV}/alerts", d.token))
    assert [(a["product_id"], a["status"], a["quantity"]) for a in alerts] == [
        (out["id"], "out_of_stock", 0),
        (low["id"], "low_stock", 3),
    ]
    assert {a["location_id"] for a in alerts} == {shop["id"]}
    assert [a["product_id"] for a in ok(api_client("GET", f"{INV}/alerts/low-stock", d.token))] == [low["id"]]
    assert [a["product_id"] for a in ok(api_client("GET", f"{INV}/alerts/out-of-stock", d.token))] == [out["id"]]

    # a stock-out to the threshold makes a product low; a deactivated product raises no alert
    _post(
        api_client,
        d,
        "/movements/stock-out",
        {"product_id": fine["id"], "location_id": shop["id"], "source": "LOCAL_SALE", "quantity": 1},
    )
    assert fine["id"] in [a["product_id"] for a in ok(api_client("GET", f"{INV}/alerts/low-stock", d.token))]
    ok(api_client("PATCH", f"{INV}/products/{out['id']}", d.token, json={"is_active": False}))
    assert ok(api_client("GET", f"{INV}/alerts/out-of-stock", d.token)) == []


# --- the dashboard ----------------------------------------------------------------------------------------------------


def test_the_dashboard_figures_match_the_movements(api_client, fresh_dealer):
    d = fresh_dealer()
    empty = ok(api_client("GET", f"{INV}/dashboard", d.token))
    assert empty["totals"] == {"products": 0, "stock_units": 0, "low_stock": 0, "out_of_stock": 0, "inventory_value": 0}
    assert len(empty["trend"]) == 30
    assert all(p["in"] == 0 and p["out"] == 0 for p in empty["trend"])

    shop = _location(api_client, d, "Dash shop")
    godown = _location(api_client, d, "Dash godown", kind="godown")
    urea = _product(api_client, d, "D-UREA", cost_price=3500, reorder_threshold=5)
    dap = _product(api_client, d, "D-DAP", cost_price=9800.5, reorder_threshold=2)
    seed = _product(api_client, d, "D-SEED", reorder_threshold=1)  # no cost price: adds nothing to the value
    _product(api_client, d, "D-NONE", reorder_threshold=0)  # never stocked: out of stock
    base = {"product_id": urea["id"], "location_id": shop["id"]}
    _post(api_client, d, "/movements/stock-in", {**base, "quantity": 12})
    _post(api_client, d, "/movements/adjustment", {**base, "direction": "out", "quantity": 1, "reason": "Count"})
    _post(
        api_client,
        d,
        "/stock/transfer",
        {"product_id": urea["id"], "from_location_id": shop["id"], "to_location_id": godown["id"], "quantity": 7},
    )
    _post(api_client, d, "/movements/stock-out", {**base, "source": "DAMAGE", "quantity": 0.5, "reason": "Torn"})
    _post(api_client, d, "/movements/stock-in", {"product_id": seed["id"], "location_id": shop["id"], "quantity": 4})
    purchase = _post(
        api_client,
        d,
        "/purchases",
        {"items": [{"product_id": dap["id"], "location_id": shop["id"], "quantity": 2, "unit_cost": 9700}]},
    )
    ok(api_client("POST", f"{INV}/purchases/{purchase['id']}/receive", d.token))

    dash = ok(api_client("GET", f"{INV}/dashboard", d.token))
    movements = _movements(api_client, d)
    stock = {p["id"]: p for p in ok(api_client("GET", f"{INV}/products", d.token))}

    # totals, recomputed from the stock the movements left
    units = sum(p["total_quantity"] for p in stock.values())
    assert units == 12 - 1 - 0.5 + 4 + 2  # the transfer moved units, it did not add any
    value = round(sum(p["total_quantity"] * p["cost_price"] for p in stock.values() if p["cost_price"] is not None), 2)
    assert value == round(10.5 * 3500 + 2 * 9800.5, 2)
    # urea: 3.5 at the default shop (threshold 5) is low; dap: 2 at the shop (threshold 2) is low; D-NONE is out
    assert dash["totals"] == {
        "products": 4,
        "stock_units": units,
        "low_stock": 2,
        "out_of_stock": 1,
        "inventory_value": value,
    }
    assert [a["status"] for a in dash["alerts"]] == ["out_of_stock", "low_stock", "low_stock"]

    # recent activity is the ledger's newest rows
    assert [m["id"] for m in dash["recent_movements"]] == [m["id"] for m in movements[:10]]
    assert [m["id"] for m in dash["recent_adjustments"]] == [
        m["id"] for m in movements if m["source"] == "MANUAL_ADJUSTMENT"
    ][:5]
    assert [m["id"] for m in dash["recent_restocks"]] == [
        m["id"] for m in movements if m["source"] in ("RESTOCK", "PURCHASE")
    ][:5]
    assert [p["id"] for p in dash["recent_purchases"]] == [purchase["id"]]

    # today's trend point is the units in and out today, transfers left out
    today = datetime.now(UTC).date().isoformat()
    point = next(p for p in dash["trend"] if p["date"] == today)
    in_today = sum(m["quantity"] for m in movements if m["direction"] == "in" and m["source"] != "TRANSFER")
    out_today = sum(m["quantity"] for m in movements if m["direction"] == "out" and m["source"] != "TRANSFER")
    assert (point["in"], point["out"]) == (in_today, out_today) == (18, 1.5)
    assert sum(p["in"] for p in dash["trend"]) == 18
    assert dash["trend"][-1]["date"] == today
    assert dash["sync_failures"] == 0


# --- the legacy dealer routes, served from the IMS tables -------------------------------------------------------------


def test_the_legacy_dealer_routes_write_through_the_ledger(api_client, fresh_dealer, world):
    d = fresh_dealer()
    listing = ok(
        api_client(
            "POST",
            "/api/v1/marketplace/listings",
            d.token,
            json={
                "title": "Legacy urea",
                "price": 10.0,
                "unit": "bag",
                "quantity": 1,
                "category_id": world.category_id,
                "brand": "Smoke",
                "condition": "new",
            },
        )
    )
    item = ok(
        api_client(
            "POST",
            f"{DEALER}/inventory",
            d.token,
            json={"listing_id": listing["id"], "stock_quantity": 10, "unit": "bag", "min_stock_threshold": 2},
        )
    )
    assert item["stock_quantity"] == 10
    assert item["listing_id"] == listing["id"]
    sold = ok(
        api_client("POST", f"{DEALER}/inventory/{item['id']}/adjust", d.token, json={"type": "sale", "quantity": 3})
    )
    assert sold["stock_quantity"] == 7
    corrected = ok(
        api_client(
            "POST",
            f"{DEALER}/inventory/{item['id']}/adjust",
            d.token,
            json={"type": "correction", "quantity": 9, "notes": "Recount"},
        )
    )
    assert corrected["stock_quantity"] == 9
    short = api_client(
        "POST", f"{DEALER}/inventory/{item['id']}/adjust", d.token, json={"type": "reduction", "quantity": 50}
    )
    assert short.status_code == 422, short.text
    assert short.json()["code"] == "insufficient_stock", short.text

    history = ok(api_client("GET", f"{DEALER}/inventory/{item['id']}/transactions", d.token))
    assert [(t["type"], t["quantity"]) for t in history] == [("adjustment", 2), ("reduction", -3), ("restock", 10)]
    movements = _movements(api_client, d, f"product_id={item['id']}")
    assert [m["source"] for m in movements] == ["MANUAL_ADJUSTMENT", "LOCAL_SALE", "RESTOCK"]
    assert_ledger_explains_stock(api_client, d, item["id"])

    stores = ok(api_client("GET", f"{DEALER}/stores", d.token))
    assert [s["name"] for s in stores] == ["Main store"]  # created on the first stock change (D8)
    assert ok(api_client("GET", f"{DEALER}/inventory", d.token))[0]["id"] == item["id"]
    supplier = ok(api_client("POST", f"{DEALER}/suppliers", d.token, json={"name": "Legacy supplier"}))
    assert ok(api_client("GET", f"{INV}/suppliers/{supplier['id']}", d.token))["name"] == "Legacy supplier"


# --- the B2 verification findings (F3-F8), on the real stack ----------------------------------------------------------


def _raw_json(api_client, d: Dealer, method: str, path: str, raw: str):
    return api_client(method, path, d.token, content=raw.encode(), headers={"Content-Type": "application/json"})


def test_alerts_dashboard_and_analytics_weigh_more_than_1000_products(api_client, fresh_dealer):
    """F3: PostgREST returns at most 1000 rows a request (max_rows); the lists that weigh every product read them page
    by page. 1005 never-stocked products are bulk-inserted as the database owner (an API create each would take
    minutes); every one is out of stock, and the last ones by name sort past the first page."""
    d = fresh_dealer()
    _location(api_client, d, "Bulk shop")
    sql(
        "insert into public.inventory_products (dealer_id, sku, name, reorder_threshold) "
        f"select '{d.id}', 'BULK-' || lpad(n::text, 4, '0'), 'Bulk ' || lpad(n::text, 4, '0'), 0 "
        "from generate_series(1, 1005) n"
    )
    assert count_rows("inventory_products", d.id) == 1005

    alerts = ok(api_client("GET", f"{INV}/alerts", d.token))
    assert len(alerts) == 1005
    assert {"Bulk 1001", "Bulk 1005"} <= {a["name"] for a in alerts}
    assert len(ok(api_client("GET", f"{INV}/alerts/out-of-stock", d.token))) == 1005

    totals = ok(api_client("GET", f"{INV}/dashboard", d.token))["totals"]
    assert (totals["products"], totals["out_of_stock"]) == (1005, 1005)
    assert ok(api_client("GET", "/api/v1/analytics/dealer", d.token))["lowStockCount"] == 1005

    # the analytics count stores and suppliers from the legacy lists, every row of them too
    sql(
        "insert into public.inventory_suppliers (dealer_id, name) "
        f"select '{d.id}', 'Bulk supplier ' || n from generate_series(1, 1003) n"
    )
    analytics = ok(api_client("GET", "/api/v1/analytics/dealer", d.token))
    assert (analytics["supplierCount"], analytics["storeCount"]) == (1003, 1)
    # while the legacy list route still returns one page
    assert len(ok(api_client("GET", f"{DEALER}/suppliers?limit=100", d.token))) == 100


def test_a_refused_legacy_create_leaves_nothing_behind(api_client, fresh_dealer, world):
    """F4: a figure the database cannot hold (1e10 > numeric(12, 2)) is refused before the product is written, so
    neither a product nor a listing link is left behind."""
    d = fresh_dealer()
    listing = ok(
        api_client(
            "POST",
            "/api/v1/marketplace/listings",
            d.token,
            json={
                "title": "F4 urea",
                "price": 10.0,
                "unit": "bag",
                "quantity": 1,
                "category_id": world.category_id,
                "brand": "Smoke",
                "condition": "new",
            },
        )
    )
    _location(api_client, d, "F4 shop")
    before = fingerprint(d.id)
    head = f'{{"listing_id": "{listing["id"]}", "unit": "bag", '
    for raw in (
        head + '"stock_quantity": 1e10, "min_stock_threshold": 0}',
        head + '"stock_quantity": 1, "min_stock_threshold": 1e10}',
        head + '"stock_quantity": 1, "min_stock_threshold": 0, "purchase_cost": 1e10}',
    ):
        response = _raw_json(api_client, d, "POST", f"{DEALER}/inventory", raw)
        assert response.status_code == 422, response.text
        assert response.json()["code"] == "validation_failed"
    assert count_rows("inventory_products", d.id) == 0
    assert fingerprint(d.id) == before


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity"])
def test_a_legacy_route_answers_422_to_a_non_finite_price(api_client, dealer, literal):
    """F5: the legacy bodies use the IMS Amount, so NaN and Infinity stop at the schema (they used to answer 500)."""
    item = ok(
        api_client(
            "POST",
            f"{DEALER}/inventory",
            dealer.token,
            json={"listing_id": None, "stock_quantity": 0, "unit": "bag", "min_stock_threshold": 0},
        )
    )
    create = '{"listing_id": null, "stock_quantity": 1, "unit": "bag", "min_stock_threshold": 0, "selling_price": '
    for method, path, raw in (
        ("POST", f"{DEALER}/inventory", create + literal + "}"),
        ("PATCH", f"{DEALER}/inventory/{item['id']}", '{"purchase_cost": ' + literal + "}"),
    ):
        response = _raw_json(api_client, dealer, method, path, raw)
        assert response.status_code == 422, (method, response.text)
        assert response.json()["code"] == "validation_failed"


def test_a_purchase_date_must_be_a_plausible_day(api_client, fresh_dealer):
    """F6: "infinity", "epoch" and "0001-01-01" were read by Postgres as dates; they are refused, and so is a day before
    2000 or more than a year ahead. A refused create or edit writes nothing."""
    d = fresh_dealer()
    draft = _post(api_client, d, "/purchases", {"reference": "F6", "purchased_on": "2026-10-01"})
    assert draft["purchased_on"] == "2026-10-01"
    before = fingerprint(d.id)
    far = (datetime.now(UTC).date() + timedelta(days=366)).isoformat()
    for bad in ("infinity", "-infinity", "epoch", "today", "0001-01-01", "1999-12-31", far):
        created = api_client("POST", f"{INV}/purchases", d.token, json={"purchased_on": bad})
        assert created.status_code == 422, (bad, created.text)
        edited = api_client("PATCH", f"{INV}/purchases/{draft['id']}", d.token, json={"purchased_on": bad})
        assert edited.status_code == 422, (bad, edited.text)
    assert fingerprint(d.id) == before
    ahead = (datetime.now(UTC).date() + timedelta(days=30)).isoformat()
    moved = ok(api_client("PATCH", f"{INV}/purchases/{draft['id']}", d.token, json={"purchased_on": ahead}))
    assert moved["purchased_on"] == ahead


def test_free_text_has_a_length_cap(api_client, fresh_dealer):
    """F8: a 1 MB product name was accepted. Each free-text field has a cap, refused with a field error."""
    d = fresh_dealer()
    shop = _location(api_client, d, "Cap shop")
    product = _product(api_client, d, "CAP-1", name="n" * 120)
    assert product["name"] == "n" * 120
    move = {"product_id": product["id"], "location_id": shop["id"], "quantity": 1}
    refused = [
        ("POST", f"{INV}/products", {"sku": "CAP-2", "name": "n" * 121}),
        ("POST", f"{INV}/products", {"sku": "s" * 121, "name": "N"}),
        ("PATCH", f"{INV}/products/{product['id']}", {"name": "n" * 121}),
        ("POST", f"{INV}/locations", {"name": "n" * 121}),
        ("POST", f"{INV}/suppliers", {"name": "S", "notes": "x" * 1001}),
        ("POST", f"{INV}/purchases", {"reference": "r" * 81}),
        ("POST", f"{INV}/movements/stock-in", {**move, "reason": "x" * 1001}),
        ("POST", f"{INV}/movements/adjustment", {**move, "direction": "in", "reason": "x" * 1001}),
        ("POST", f"{DEALER}/stores", {"name": "n" * 121}),
        ("POST", f"{DEALER}/suppliers", {"name": "n" * 121}),
    ]
    before = fingerprint(d.id)
    for method, path, body in refused:
        response = api_client(method, path, d.token, json=body)
        assert response.status_code == 422, (path, response.text)
    assert fingerprint(d.id) == before


def test_a_retried_stock_write_with_an_idempotency_key_is_recorded_once(api_client, fresh_dealer):
    """F8: a retry carrying the same Idempotency-Key returns the first response and writes nothing; the same key with a
    different body is refused; with no key every request is its own write, as before."""
    d = fresh_dealer()
    shop = _location(api_client, d, "Idem shop")
    godown = _location(api_client, d, "Idem godown", kind="godown")
    product = _product(api_client, d, "IDEM-1")
    move = {"product_id": product["id"], "location_id": shop["id"]}

    def post(path: str, body: dict, key: str | None):
        headers = {"Idempotency-Key": key} if key else {}
        return api_client("POST", f"{INV}{path}", d.token, json=body, headers=headers)

    first = ok(post("/movements/stock-in", {**move, "quantity": 10}, "stock-in-key-1"), 201)
    assert ok(post("/movements/stock-in", {**move, "quantity": 10}, "stock-in-key-1"), 201)["id"] == first["id"]
    assert count_rows("inventory_movements", d.id) == 1
    assert _stock(api_client, d, product["id"]) == {shop["id"]: 10}

    reused = post("/movements/stock-in", {**move, "quantity": 11}, "stock-in-key-1")
    assert reused.status_code == 422, reused.text
    assert reused.json()["code"] == "idempotency_key_reused"

    for path, body in (
        ("/movements/stock-out", {**move, "quantity": 1, "source": "DAMAGE", "reason": "Torn"}),
        ("/movements/adjustment", {**move, "quantity": 1, "direction": "out", "reason": "Count"}),
    ):
        once = ok(post(path, body, f"key-{path}"), 201)
        assert ok(post(path, body, f"key-{path}"), 201)["id"] == once["id"]
    transfer = {
        "product_id": product["id"],
        "from_location_id": shop["id"],
        "to_location_id": godown["id"],
        "quantity": 2,
    }
    halves = ok(post("/stock/transfer", transfer, "transfer-key-1"), 201)
    replayed = ok(post("/stock/transfer", transfer, "transfer-key-1"), 201)
    assert [m["id"] for m in replayed] == [m["id"] for m in halves]
    # stock in, stock out, adjustment, and the two halves of one transfer
    assert count_rows("inventory_movements", d.id) == 5
    assert _stock(api_client, d, product["id"]) == {shop["id"]: 6, godown["id"]: 2}
    assert_ledger_explains_stock(api_client, d, product["id"])

    # no key: two requests, two movements; a key too short to be one is refused
    ok(post("/movements/stock-in", {**move, "quantity": 1}, None), 201)
    ok(post("/movements/stock-in", {**move, "quantity": 1}, None), 201)
    assert count_rows("inventory_movements", d.id) == 7
    assert post("/movements/stock-in", {**move, "quantity": 1}, "short").status_code == 422
    assert count_rows("inventory_movements", d.id) == 7


def test_a_retried_purchase_create_with_an_idempotency_key_is_recorded_once(api_client, fresh_dealer):
    """F8: the same for purchase create: one header and one line, however often the request is retried."""
    d = fresh_dealer()
    shop = _location(api_client, d, "Idem PO shop")
    product = _product(api_client, d, "IDEM-PO-1")
    purchase = {
        "reference": "IDEM-PO",
        "items": [{"product_id": product["id"], "location_id": shop["id"], "quantity": 3}],
    }
    headers = {"Idempotency-Key": "purchase-key-1"}
    created = ok(api_client("POST", f"{INV}/purchases", d.token, json=purchase, headers=headers), 201)
    again = ok(api_client("POST", f"{INV}/purchases", d.token, json=purchase, headers=headers), 201)
    assert again["id"] == created["id"]
    assert count_rows("inventory_purchases", d.id) == 1
    assert count_rows("inventory_purchase_items", d.id) == 1


def test_a_legacy_change_of_zero_or_less_is_refused_not_flipped(api_client, fresh_dealer):
    """F8: a restock of -1 was recorded as +1 (abs). A change of zero or less is refused and writes nothing; setting an
    exact quantity of zero still works."""
    d = fresh_dealer()
    item = ok(
        api_client(
            "POST",
            f"{DEALER}/inventory",
            d.token,
            json={"listing_id": None, "stock_quantity": 5, "unit": "bag", "min_stock_threshold": 0},
        )
    )
    before = fingerprint(d.id)
    for type_ in ("addition", "restock", "sale", "reduction"):
        for quantity in (-1, 0):
            response = api_client(
                "POST", f"{DEALER}/inventory/{item['id']}/adjust", d.token, json={"type": type_, "quantity": quantity}
            )
            assert response.status_code == 422, (type_, quantity, response.text)
    assert fingerprint(d.id) == before
    zeroed = ok(
        api_client(
            "POST", f"{DEALER}/inventory/{item['id']}/adjust", d.token, json={"type": "correction", "quantity": 0}
        )
    )
    assert zeroed["stock_quantity"] == 0
