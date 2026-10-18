"""A listing's link to an inventory product, on the real stack (B3, D8; listings.inventory_product_id).

The marketplace listing routes take `inventory_product_id`; the trigger guard_inventory_references
(20261021080000_inventory_data_model.sql) lets a listing feed only from its owner's own product, and
listing_availability (20261022090000_inventory_sync.sql) then answers from that product's stock at the owner's
default location. Two fresh approved dealers and the shared farmer prove the rules through the API and through
PostgREST with the same sessions: a dealer links only their own product, and only to their own listing; a farmer's
listing has none; the word follows the IMS stock (in, low, out) and ignores other locations; an edit keeps, clears or
moves the link.
"""

from __future__ import annotations

import os
import uuid

import httpx
import pytest
from inventory_world import INV, Dealer, approved_dealer, ok, sql

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
LISTINGS = "/api/v1/marketplace/listings"


def _rest_patch_listing(token: str, listing_id: str, body: dict) -> httpx.Response:
    return httpx.patch(
        f"{LOCAL_URL}/rest/v1/listings?id=eq.{listing_id}",
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        json=body,
        timeout=30,
    )


def _link_of(listing_id: str) -> str:
    """The stored link, read as the database owner: a refused call must have changed nothing, whoever can read it."""
    uuid.UUID(listing_id)
    return sql(f"select coalesce(inventory_product_id::text, '-') from public.listings where id = '{listing_id}'")


def _listing_body(title: str, category_id: str, **extra) -> dict:
    return {
        "title": title,
        "price": 3900.0,
        "unit": "bag",
        # Far above any IMS figure below: a linked listing's word must come from the product's stock, not this.
        "quantity": 100,
        "category_id": category_id,
        "brand": "Smoke",
        "condition": "new",
        **extra,
    }


def _word(api_client, listing_id: str) -> str:
    """What a buyer is told, signed out, on the detail and in browse."""
    detail = ok(api_client("GET", f"{LISTINGS}/{listing_id}"))
    return detail["availability"]


def _stock(api_client, dealer: Dealer, direction: str, quantity: float, location: str | None = None) -> None:
    body = {"product_id": dealer.ids["product"], "location_id": location or dealer.ids["shop"], "quantity": quantity}
    if direction == "in":
        ok(api_client("POST", f"{INV}/movements/stock-in", dealer.token, json={**body, "reason": "Delivery"}), 201)
    else:
        body.update(source="DAMAGE", reason="Torn bags")
        ok(api_client("POST", f"{INV}/movements/stock-out", dealer.token, json=body), 201)


def _dealer_with_product(api_client, backend_url: str, admin_token: str, threshold: float) -> Dealer:
    """An approved dealer with a default shop, a godown and one product, but no stock yet."""
    dealer = approved_dealer(backend_url, admin_token)
    run = uuid.uuid4().hex[:6]
    shop = ok(api_client("POST", f"{INV}/locations", dealer.token, json={"name": f"Shop {run}", "kind": "shop"}), 201)
    godown = ok(
        api_client("POST", f"{INV}/locations", dealer.token, json={"name": f"Godown {run}", "kind": "godown"}), 201
    )
    assert shop["is_default"]
    assert not godown["is_default"]
    product = ok(
        api_client(
            "POST",
            f"{INV}/products",
            dealer.token,
            json={"sku": f"UREA-{run}", "name": f"Urea {run}", "unit": "bag", "reorder_threshold": threshold},
        ),
        201,
    )
    dealer.ids.update(shop=shop["id"], godown=godown["id"], product=product["id"])
    return dealer


@pytest.fixture(scope="module")
def dealers(api_client, backend_url, world) -> tuple[Dealer, Dealer]:
    return (
        _dealer_with_product(api_client, backend_url, world.admin.token, threshold=5),
        _dealer_with_product(api_client, backend_url, world.admin.token, threshold=0),
    )


def test_a_dealer_links_only_their_own_product_and_only_to_their_own_listing(api_client, world, dealers):
    a, b = dealers
    # allowed: A's listing on A's product, through the marketplace route
    created = ok(
        api_client(
            "POST",
            LISTINGS,
            a.token,
            json=_listing_body("Linked urea", world.category_id, inventory_product_id=a.ids["product"]),
        )
    )
    listing_id = created["id"]
    assert created["inventory_product_id"] == a.ids["product"]
    assert _link_of(listing_id) == a.ids["product"]

    # refused: A creating a listing on B's product; nothing is written
    title = f"Borrowed urea {uuid.uuid4().hex[:6]}"
    foreign = api_client(
        "POST", LISTINGS, a.token, json=_listing_body(title, world.category_id, inventory_product_id=b.ids["product"])
    )
    assert foreign.status_code == 403, foreign.text
    assert foreign.json()["code"] == "forbidden"
    assert foreign.json()["title"] == "You can link only your own inventory product"
    assert sql(f"select count(*) from public.listings where owner_id = '{a.id}' and title = '{title}'") == "0"

    # refused: A moving their own listing onto B's product; the link stays
    moved = api_client("PATCH", f"{LISTINGS}/{listing_id}", a.token, json={"inventory_product_id": b.ids["product"]})
    assert moved.status_code == 403, moved.text
    assert moved.json()["code"] == "forbidden"
    assert _link_of(listing_id) == a.ids["product"]

    # refused: B pointing A's listing at B's own product, or clearing it; the owner match finds no row (404)
    for body in ({"inventory_product_id": b.ids["product"]}, {"inventory_product_id": None}):
        hijack = api_client("PATCH", f"{LISTINGS}/{listing_id}", b.token, json=body)
        assert hijack.status_code == 404, hijack.text
        assert _link_of(listing_id) == a.ids["product"]

    # PostgREST, same sessions: the trigger refuses A's direct write of B's product; B's write matches no row
    direct = _rest_patch_listing(a.token, listing_id, {"inventory_product_id": b.ids["product"]})
    assert direct.status_code == 403, direct.text
    assert direct.json()["code"] == "42501"
    by_other = _rest_patch_listing(b.token, listing_id, {"inventory_product_id": b.ids["product"]})
    assert by_other.status_code == 200, by_other.text
    assert by_other.json() == []
    assert _link_of(listing_id) == a.ids["product"]

    # an unknown or malformed product id is refused too, never stored
    for bad, status in ((str(uuid.uuid4()), 403), ("not-a-uuid", 422)):
        refused = api_client("PATCH", f"{LISTINGS}/{listing_id}", a.token, json={"inventory_product_id": bad})
        assert refused.status_code == status, (bad, refused.text)
    assert _link_of(listing_id) == a.ids["product"]


def test_a_farmers_listing_has_no_product_link(api_client, world, dealers):
    a, _ = dealers
    plain = ok(
        api_client(
            "POST",
            LISTINGS,
            world.farmer.token,
            json={
                "title": "Farm wheat",
                "price": 100.0,
                "unit": "kg",
                "quantity": 40,
                "category_id": world.category_id,
            },
        )
    )
    assert plain["inventory_product_id"] is None
    assert _link_of(plain["id"]) == "-"

    # a farmer has no products; naming a dealer's is refused on create and on edit, and nothing is stored
    body = {"title": "Farm urea", "price": 100.0, "unit": "kg", "quantity": 40, "category_id": world.category_id}
    refused = api_client("POST", LISTINGS, world.farmer.token, json={**body, "inventory_product_id": a.ids["product"]})
    assert refused.status_code == 403, refused.text
    assert refused.json()["code"] == "forbidden"
    edit = api_client(
        "PATCH", f"{LISTINGS}/{plain['id']}", world.farmer.token, json={"inventory_product_id": a.ids["product"]}
    )
    assert edit.status_code == 403, edit.text
    assert _link_of(plain["id"]) == "-"
    direct = _rest_patch_listing(world.farmer.token, plain["id"], {"inventory_product_id": a.ids["product"]})
    assert direct.status_code == 403, direct.text
    assert _link_of(plain["id"]) == "-"


def test_a_linked_listing_shows_the_ims_stock_word_at_the_default_location(api_client, world, dealers):
    a, _ = dealers
    listing_id = ok(
        api_client(
            "POST",
            LISTINGS,
            a.token,
            json=_listing_body("Stock word urea", world.category_id, inventory_product_id=a.ids["product"]),
        )
    )["id"]
    # no stock row yet at the default location: out, although the listing itself says 100
    assert _word(api_client, listing_id) == "out_of_stock"

    # stock elsewhere does not sell on the marketplace (D8): 50 in the godown, still out
    _stock(api_client, a, "in", 50, location=a.ids["godown"])
    assert _word(api_client, listing_id) == "out_of_stock"

    _stock(api_client, a, "in", 20)  # 20 at the default shop, above the threshold of 5
    assert _word(api_client, listing_id) == "in_stock"
    _stock(api_client, a, "out", 15)  # 5 left, at the threshold
    assert _word(api_client, listing_id) == "low_stock"
    _stock(api_client, a, "out", 5)  # none left at the default location
    assert _word(api_client, listing_id) == "out_of_stock"

    # browse carries the same word, and never the figures (SRDS §15)
    page = ok(api_client("GET", f"{LISTINGS}?owner_id={a.id}"))
    row = next(r for r in page if r["id"] == listing_id)
    assert row["availability"] == "out_of_stock"
    assert "stock_quantity" not in row
    assert "reorder_threshold" not in row

    # an unlinked listing of the same dealer answers from its own quantity, as before B3 ("Listing availability")
    unlinked = ok(api_client("POST", LISTINGS, a.token, json=_listing_body("Unlinked urea", world.category_id)))
    assert unlinked["inventory_product_id"] is None
    assert _word(api_client, unlinked["id"]) == "in_stock"


def test_editing_a_listing_keeps_clears_or_moves_the_link(api_client, world, dealers):
    a, _ = dealers
    run = uuid.uuid4().hex[:6]
    second = ok(api_client("POST", f"{INV}/products", a.token, json={"sku": f"DAP-{run}", "name": f"DAP {run}"}), 201)
    listing_id = ok(
        api_client(
            "POST",
            LISTINGS,
            a.token,
            json=_listing_body("Edited urea", world.category_id, inventory_product_id=a.ids["product"]),
        )
    )["id"]

    # an edit that does not name the link keeps it
    kept = ok(
        api_client("PATCH", f"{LISTINGS}/{listing_id}", a.token, json={"title": "Edited urea 50kg", "price": 3950})
    )
    assert kept["inventory_product_id"] == a.ids["product"]
    assert _link_of(listing_id) == a.ids["product"]

    # naming another of the dealer's own products moves it
    moved = ok(api_client("PATCH", f"{LISTINGS}/{listing_id}", a.token, json={"inventory_product_id": second["id"]}))
    assert moved["inventory_product_id"] == second["id"]
    assert _link_of(listing_id) == second["id"]
    assert _word(api_client, listing_id) == "out_of_stock"  # the second product has no stock

    # null clears it: the listing then answers from its own quantity again
    cleared = ok(api_client("PATCH", f"{LISTINGS}/{listing_id}", a.token, json={"inventory_product_id": None}))
    assert cleared["inventory_product_id"] is None
    assert _link_of(listing_id) == "-"
    assert _word(api_client, listing_id) == "in_stock"

    # the IMS sees the link the marketplace wrote: relinked here, it shows on the product's own page
    ok(api_client("PATCH", f"{LISTINGS}/{listing_id}", a.token, json={"inventory_product_id": second["id"]}))
    product = ok(api_client("GET", f"{INV}/products/{second['id']}", a.token))
    assert [entry["id"] for entry in product["listings"]] == [listing_id]
