"""B2 verification F1, F2 and F7 on the real stack: concurrent requests through the real API cannot double a purchase's
lines, cannot receive a half-edited draft, and cannot leave a dealer with no default location or two.

Before 20261025090000_purchase_atomic_writes.sql the API replaced a draft's lines as three PostgREST calls (select,
delete, insert), so eight concurrent edits left eight lines and receiving brought in 40 units instead of 5; and it moved
the default location as two calls (clear, then set). Each test fires its requests together from threads released by
one barrier, each with its own connection, then reads the result as the database owner (inventory_world.sql), which no
row-level security filters.
"""

from __future__ import annotations

import threading
import uuid
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest
from conftest import ANON_KEY, LOCAL_URL
from inventory_world import INV, Dealer, approved_dealer, count_rows, ok, sql

ROUNDS = 10


@pytest.fixture
def fresh_dealer(world, backend_url):
    return lambda: approved_dealer(backend_url, world.admin.token)


def _together(backend_url: str, token: str, requests: list[tuple[str, str, dict | None]]) -> list[httpx.Response]:
    """Sends every request at the same moment, each from its own thread and connection."""
    barrier = threading.Barrier(len(requests))

    def send(request: tuple[str, str, dict | None]) -> httpx.Response:
        method, path, body = request
        with httpx.Client(base_url=backend_url, timeout=60) as client:
            barrier.wait()
            return client.request(method, path, json=body, headers={"Authorization": f"Bearer {token}"})

    with ThreadPoolExecutor(max_workers=len(requests)) as pool:
        return list(pool.map(send, requests))


def _setup(api_client, d: Dealer) -> tuple[dict, dict]:
    run = uuid.uuid4().hex[:6]
    shop = ok(api_client("POST", f"{INV}/locations", d.token, json={"name": f"Race shop {run}"}), 201)
    product = ok(api_client("POST", f"{INV}/products", d.token, json={"sku": f"RACE-{run}", "name": "Race urea"}), 201)
    return shop, product


def _purchase_state(purchase_id: str) -> tuple[str, list[float], list[float]]:
    """The purchase's status, its line quantities, and the quantities of the PURCHASE movements it wrote."""
    uuid.UUID(purchase_id)
    status = sql(f"select status from public.inventory_purchases where id = '{purchase_id}'")
    lines = sql(f"select quantity from public.inventory_purchase_items where purchase_id = '{purchase_id}' order by 1")
    moved = sql(
        "select quantity from public.inventory_movements "
        f"where purchase_id = '{purchase_id}' and source = 'PURCHASE' order by 1"
    )
    return status, [float(q) for q in lines.split()], [float(q) for q in moved.split()]


def _stock(product_id: str, location_id: str) -> float:
    value = sql(
        "select coalesce(sum(quantity), 0) from public.inventory_stock "
        f"where product_id = '{product_id}' and location_id = '{location_id}'"
    )
    return float(value)


def test_eight_concurrent_identical_line_edits_leave_one_line_and_receive_brings_in_five(
    api_client, backend_url, fresh_dealer
):
    """F1: every edit replaces the lines under the purchase's row lock, so the edits run one after the other."""
    d = fresh_dealer()
    shop, product = _setup(api_client, d)
    line = {"product_id": product["id"], "location_id": shop["id"], "quantity": 5}
    draft = ok(api_client("POST", f"{INV}/purchases", d.token, json={"reference": "RACE-8", "items": [line]}), 201)

    edits = _together(backend_url, d.token, [("PATCH", f"{INV}/purchases/{draft['id']}", {"items": [line]})] * 8)
    assert [r.status_code for r in edits] == [200] * 8, [r.text for r in edits]
    assert count_rows("inventory_purchase_items", d.id) == 1

    received = ok(api_client("POST", f"{INV}/purchases/{draft['id']}/receive", d.token))
    assert received["status"] == "received"
    assert _purchase_state(draft["id"]) == ("received", [5.0], [5.0])
    assert _stock(product["id"], shop["id"]) == 5


def test_a_receive_racing_a_line_edit_never_sees_a_half_edited_draft(api_client, backend_url, fresh_dealer):
    """F2: the edit and the receive take the same row lock. Whichever comes second sees the other's result: the edit
    finds the purchase received (409), or the receive brings in the edited lines. Never a received purchase with no
    lines, never stock that differs from the lines it was received with."""
    d = fresh_dealer()
    shop, product = _setup(api_client, d)
    outcomes: list[tuple[int, int, str]] = []
    for round_ in range(ROUNDS):
        old = {"product_id": product["id"], "location_id": shop["id"], "quantity": 5}
        new = {**old, "quantity": 7}
        draft = ok(
            api_client("POST", f"{INV}/purchases", d.token, json={"reference": f"RACE-R{round_}", "items": [old]}), 201
        )
        before = _stock(product["id"], shop["id"])
        receive, edit = _together(
            backend_url,
            d.token,
            [
                ("POST", f"{INV}/purchases/{draft['id']}/receive", None),
                ("PATCH", f"{INV}/purchases/{draft['id']}", {"items": [new]}),
            ],
        )
        assert receive.status_code in (200, 409), receive.text
        assert edit.status_code in (200, 409), edit.text
        if edit.status_code == 409:
            assert edit.json()["code"] == "invalid_transition", edit.text
        status, lines, moved = _purchase_state(draft["id"])
        after = _stock(product["id"], shop["id"])
        if status == "received":
            assert lines in ([5.0], [7.0]), lines
            # the stock came in exactly as the lines it was received with, once
            assert moved == lines
            assert after - before == sum(lines)
            # an edit that answered 200 ran first, so the receive brought in its lines
            if edit.status_code == 200:
                assert lines == [7.0]
        else:
            assert status == "draft"
            assert receive.status_code == 409
            assert lines == [7.0]
            assert moved == []
            assert after == before
        outcomes.append((receive.status_code, edit.status_code, status))
    assert len(outcomes) == ROUNDS


def test_concurrent_default_swaps_always_leave_exactly_one_active_default(api_client, backend_url, fresh_dealer):
    """F7: set_default_location locks the current default first, so concurrent moves queue; a deactivation racing a
    move is refused by the immediate trigger with its message, as a 409. No answer is a 500."""
    d = fresh_dealer()
    run = uuid.uuid4().hex[:6]
    places = [
        ok(api_client("POST", f"{INV}/locations", d.token, json={"name": f"Swap {run} {n}"}), 201) for n in range(4)
    ]
    for round_ in range(ROUNDS):
        target = places[round_ % 4]["id"]
        other = places[(round_ + 1) % 4]["id"]
        requests: list[tuple[str, str, dict | None]] = [
            ("PATCH", f"{INV}/locations/{p['id']}", {"is_default": True}) for p in places
        ] * 2
        requests.append(("PATCH", f"{INV}/locations/{target}", {"is_active": False}))
        requests.append(("PATCH", f"/api/v1/dealer/stores/{other}", {"status": "inactive"}))
        responses = _together(backend_url, d.token, requests)
        for response in responses:
            assert response.status_code in (200, 409), response.text
            if response.status_code == 409:
                assert response.json()["code"] == "conflict", response.text
        defaults = sql(
            "select count(*) filter (where is_default), count(*) filter (where is_default and is_active) "
            f"from public.inventory_locations where dealer_id = '{d.id}'"
        )
        assert defaults == "1|1", (round_, defaults)
        # put every place back to active for the next round
        for p in places:
            reactivate = api_client("PATCH", f"{INV}/locations/{p['id']}", d.token, json={"is_active": True})
            assert reactivate.status_code == 200, reactivate.text


def test_postgrest_returns_the_commit_time_default_rule_and_changes_nothing(api_client, fresh_dealer):
    """F7 over HTTP, straight to PostgREST as the dealer: clearing the default passes every statement and is refused
    only at commit by the deferred check_inventory_default_location. PostgREST commits before it answers, so the
    request gets the 23514 with its message, and the default is still set. Deactivating the default is refused at once
    by the immediate trigger."""
    d = fresh_dealer()
    shop = ok(api_client("POST", f"{INV}/locations", d.token, json={"name": "Commit shop"}), 201)
    assert shop["is_default"] is True
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {d.token}", "Content-Type": "application/json"}
    url = f"{LOCAL_URL}/rest/v1/inventory_locations?id=eq.{shop['id']}"
    with httpx.Client(timeout=30) as client:
        cleared = client.patch(url, json={"is_default": False}, headers=headers)
        deactivated = client.patch(url, json={"is_active": False}, headers=headers)
    assert cleared.status_code >= 400, cleared.text
    assert cleared.json()["code"] == "23514", cleared.text
    assert cleared.json()["message"] == "You need a default location: make another location the default first"
    assert deactivated.status_code >= 400, deactivated.text
    assert deactivated.json()["code"] == "23514", deactivated.text
    assert deactivated.json()["message"] == "The default location must be active"
    assert sql(f"select is_default and is_active from public.inventory_locations where id = '{shop['id']}'") == "t"


def test_simultaneous_legacy_creates_on_one_listing_leave_one_linked_product_and_no_orphan(
    api_client, backend_url, world, fresh_dealer
):
    """B2 re-verification N1: N creates read the listing unlinked at once. The link takes only a listing whose product
    link is still empty, so one wins; the others answer 409 and delete their product before any stock is recorded."""
    d = fresh_dealer()
    for round_ in range(3):
        listing = ok(
            api_client(
                "POST",
                "/api/v1/marketplace/listings",
                d.token,
                json={
                    "title": f"N1 urea {round_}",
                    "price": 10.0,
                    "unit": "bag",
                    "quantity": 1,
                    "category_id": world.category_id,
                    "brand": "Smoke",
                    "condition": "new",
                },
            )
        )
        body = {"listing_id": listing["id"], "stock_quantity": 4, "unit": "bag", "min_stock_threshold": 0}
        responses = _together(backend_url, d.token, [("POST", "/api/v1/dealer/inventory", body)] * 6)
        statuses = sorted(r.status_code for r in responses)
        assert statuses == [200] + [409] * 5, [r.text for r in responses]
        for refused in (r for r in responses if r.status_code == 409):
            assert refused.json()["code"] == "conflict", refused.text
            assert refused.json()["title"] == "This listing already has an inventory item"
        winner = next(r.json() for r in responses if r.status_code == 200)
        assert winner["listing_id"] == listing["id"]
        assert winner["stock_quantity"] == 4

        linked = sql(f"select inventory_product_id from public.listings where id = '{listing['id']}'")
        assert linked == winner["id"]
    # every product the dealer has is linked to a listing, and the stock is exactly the winners' 4 units each
    assert count_rows("inventory_products", d.id) == 3
    orphans = sql(
        "select count(*) from public.inventory_products p "
        f"where p.dealer_id = '{d.id}' "
        "and not exists (select 1 from public.listings l where l.inventory_product_id = p.id)"
    )
    assert orphans == "0"
    assert sql(f"select sum(quantity) from public.inventory_stock where dealer_id = '{d.id}'") == "12.00"
    assert count_rows("inventory_movements", d.id) == 3


def test_two_items_moving_to_one_listing_at_once_leave_one_holder_and_the_loser_unchanged(
    api_client, backend_url, world, fresh_dealer
):
    """N1 on edit: two legacy PATCHes point two items at the same free listing at once. The new listing is taken only
    while no item holds it, before any old link is cleared: one wins and lets go of its old listing; the other answers
    409 and keeps its old listing, unit and stock as they were."""
    d = fresh_dealer()

    def listing(title: str) -> str:
        created = api_client(
            "POST",
            "/api/v1/marketplace/listings",
            d.token,
            json={
                "title": title,
                "price": 10.0,
                "unit": "bag",
                "quantity": 1,
                "category_id": world.category_id,
                "brand": "Smoke",
                "condition": "new",
            },
        )
        return ok(created)["id"]

    def item(listing_id: str) -> dict:
        body = {"listing_id": listing_id, "stock_quantity": 3, "unit": "bag", "min_stock_threshold": 0}
        return ok(api_client("POST", "/api/v1/dealer/inventory", d.token, json=body))

    def holder(listing_id: str) -> str:
        return sql(f"select coalesce(inventory_product_id::text, '-') from public.listings where id = '{listing_id}'")

    for round_ in range(3):
        old_a, old_b, wanted = listing(f"N1e A {round_}"), listing(f"N1e B {round_}"), listing(f"N1e free {round_}")
        a, b = item(old_a), item(old_b)
        responses = _together(
            backend_url,
            d.token,
            [
                ("PATCH", f"/api/v1/dealer/inventory/{a['id']}", {"listing_id": wanted, "unit": "sack"}),
                ("PATCH", f"/api/v1/dealer/inventory/{b['id']}", {"listing_id": wanted, "unit": "sack"}),
            ],
        )
        assert sorted(r.status_code for r in responses) == [200, 409], [r.text for r in responses]
        loser_response = next(r for r in responses if r.status_code == 409)
        assert loser_response.json()["title"] == "This listing already has an inventory item"
        winner, loser, winner_old, loser_old = (
            (a, b, old_a, old_b)
            if responses[0].status_code == 200
            else (
                b,
                a,
                old_b,
                old_a,
            )
        )
        assert holder(wanted) == winner["id"]
        assert holder(winner_old) == "-"
        assert holder(loser_old) == loser["id"]
        unchanged = ok(api_client("GET", f"/api/v1/dealer/inventory/{loser['id']}", d.token))
        assert (unchanged["unit"], unchanged["stock_quantity"], unchanged["listing_id"]) == ("bag", 3, loser_old)
