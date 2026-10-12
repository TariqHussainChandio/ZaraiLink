"""Checkout and the dealer's IMS stock, on the real stack (B3; SRDS §15, §53.39; decisions D6, D7).

- An IMS fault never breaks the marketplace: with `inventory_stock` locked by another session, a farmer's listing (no
  IMS link) checks out at once, a linked dealer listing checks out too (confirm and dispatch stay the D6 gate), and
  browse and detail answer with `unknown`.
- The exact figures stay private: no buyer or competing dealer can call `available_stock` through PostgREST, and a
  checkout that asks for more than there is learns that it is short, never how much there is.
"""

from __future__ import annotations

import os
import subprocess
import time
import uuid

import httpx
from conftest import _local_db_container
from inventory_world import approved_dealer, sql

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
LOCK_SECONDS = 15
# The API's own deadline for an IMS read is 2 s (orders and marketplace); allow for a slow machine, not for the lock.
ANSWER_WITHIN_SECONDS = 6
LOCK_SQL = (
    f"begin; lock table public.inventory_stock in access exclusive mode; select pg_sleep({LOCK_SECONDS}); commit;"
)


def _hold_inventory_stock_lock() -> subprocess.Popen:
    """Another session takes `inventory_stock` exclusively for LOCK_SECONDS, as the database owner, and waits until the
    lock is really held before returning."""
    holder = subprocess.Popen(
        [
            "docker", "exec", "-i", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres",
            "-v", "ON_ERROR_STOP=1", "-c",
            LOCK_SQL,
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )  # fmt: skip
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        held = sql(
            "select count(*) from pg_locks l join pg_class c on c.oid = l.relation "
            "where c.relname = 'inventory_stock' and l.mode = 'AccessExclusiveLock' and l.granted"
        )
        if held == "1":
            return holder
        time.sleep(0.2)
    holder.kill()
    raise AssertionError("the lock on inventory_stock was never taken")


def _timed(call, *args, **kwargs) -> tuple[httpx.Response, float]:
    started = time.monotonic()
    response = call(*args, **kwargs)
    return response, time.monotonic() - started


def _checkout(api_client, token: str, listing_id: str, quantity: float) -> httpx.Response:
    return api_client(
        "POST",
        "/api/v1/orders/checkout",
        token,
        json={"cart_items": [{"listing_id": listing_id, "quantity": quantity}]},
    )


def test_a_locked_ims_breaks_neither_checkout_nor_browsing(world, api_client):
    holder = _hold_inventory_stock_lock()
    try:
        # a farmer's listing has no IMS link: its checkout does not touch the IMS at all
        farmer, took = _timed(_checkout, api_client, world.buyer.token, world.farmer_listing_id, 1)
        assert farmer.status_code == 200, farmer.text
        assert took < ANSWER_WITHIN_SECONDS, f"the farmer's checkout waited {took:.1f}s on the IMS"

        # a linked dealer listing: the stock pre-check is given up after its deadline, the order is still taken
        dealer, took = _timed(_checkout, api_client, world.buyer.token, world.dealer_listing_id, 1)
        assert dealer.status_code == 200, dealer.text
        assert took < ANSWER_WITHIN_SECONDS, f"the dealer listing's checkout waited {took:.1f}s"

        # browse and detail answer, with `unknown` for the linked listing
        detail, took = _timed(api_client, "GET", f"/api/v1/marketplace/listings/{world.dealer_listing_id}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["availability"] == "unknown"
        assert took < ANSWER_WITHIN_SECONDS, f"the detail waited {took:.1f}s"
        browse, took = _timed(api_client, "GET", f"/api/v1/marketplace/listings?owner_id={world.dealer.id}")
        assert browse.status_code == 200, browse.text
        assert {row["availability"] for row in browse.json()} == {"unknown"}
        assert took < ANSWER_WITHIN_SECONDS, f"browse waited {took:.1f}s"

        assert holder.poll() is None, "the lock was released before the checks finished; they proved nothing"
    finally:
        _, err = holder.communicate(timeout=LOCK_SECONDS + 30)
    assert holder.returncode == 0, err

    # once the IMS answers again, the words come back
    after = api_client("GET", f"/api/v1/marketplace/listings/{world.dealer_listing_id}")
    assert after.json()["availability"] in ("in_stock", "low_stock", "out_of_stock")


def _rpc_available_stock(token: str, listing_ids: list[str]) -> httpx.Response:
    return httpx.post(
        f"{LOCAL_URL}/rest/v1/rpc/available_stock",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"listing_ids": listing_ids},
        timeout=30,
    )


def test_no_client_reads_the_exact_stock_figures(world, backend_url):
    competitor = approved_dealer(backend_url, world.admin.token)
    for who, token in (
        ("buyer", world.buyer.token),
        ("competing dealer", competitor.token),
        ("the dealer themself", world.dealer.token),
        ("anon", ANON_KEY),
    ):
        refused = _rpc_available_stock(token, [world.dealer_listing_id])
        assert refused.status_code in (401, 403), (who, refused.text)
        assert refused.json()["code"] == "42501", (who, refused.text)


def test_a_checkout_beyond_the_stock_is_told_it_is_short_never_how_much_there_is(world, api_client):
    uuid.UUID(world.dealer_listing_id)
    figure = sql(f"select available from public.available_stock(array['{world.dealer_listing_id}'::uuid])")
    title = sql(f"select title from public.listings where id = '{world.dealer_listing_id}'")

    refused = _checkout(api_client, world.buyer.token, world.dealer_listing_id, 5000)
    assert refused.status_code == 422, refused.text
    body = refused.json()
    assert body["code"] == "insufficient_stock"
    assert body["title"] == f"Not enough stock for {title}."
    for number in {figure, figure.rstrip("0").rstrip("."), str(int(float(figure)))}:
        assert number not in refused.text.replace(title, ""), (number, refused.text)

    # the same for a farmer's listing, whose figure is its own quantity
    farmer_quantity = sql(f"select quantity from public.listings where id = '{world.farmer_listing_id}'")
    farmer_title = sql(f"select title from public.listings where id = '{world.farmer_listing_id}'")
    refused = _checkout(api_client, world.buyer.token, world.farmer_listing_id, 10_000_000)
    assert refused.status_code == 422, refused.text
    assert refused.json()["title"] == f"Not enough stock for {farmer_title}."
    assert str(int(float(farmer_quantity))) not in refused.text.replace(farmer_title, "")
