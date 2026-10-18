"""Shared helpers for the B2 inventory real-stack tests (test_smoke_inventory_*.py).

A test file cannot import another test file, so the dealer setup, the database fingerprint and the endpoint list live
here, beside contract.py and route_walk.py. Everything goes through the real API and the local database; the
fingerprint reads the tables as the database owner, which is the only way to prove that a refused call changed nothing
(an API read would itself be filtered by the row-level security under test).
"""

from __future__ import annotations

import subprocess
import uuid
from dataclasses import dataclass, field

from conftest import _local_db_container, approve_dealer, make_user, sign_in

INV = "/api/v1/inventory"
DEALER = "/api/v1/dealer"


@dataclass
class Dealer:
    id: str
    email: str
    token: str
    ids: dict[str, str] = field(default_factory=dict)


def approved_dealer(backend_url: str, admin_token: str) -> Dealer:
    """A fresh dealer, approved by the admin the way the app does it, signed in again after the decision."""
    user_id, email, token = make_user("dealer")
    approve_dealer(backend_url, admin_token, user_id, token)
    return Dealer(user_id, email, sign_in(email))


def sql(statement: str) -> str:
    """One statement as the database owner, returning psql's unaligned output."""
    return subprocess.run(
        ["docker", "exec", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", statement],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


_OWNED = (
    "inventory_locations",
    "inventory_suppliers",
    "inventory_products",
    "inventory_stock",
    "inventory_purchases",
    "inventory_purchase_items",
    "inventory_movements",
    "inventory_alert_settings",
)


def fingerprint(dealer_id: str) -> str:
    """A digest of every inventory row the dealer owns, and of their listings' product links. Equal before and after a
    refused call means the call changed nothing of theirs."""
    uuid.UUID(dealer_id)  # the id is interpolated into SQL; it must be a uuid
    parts = [
        f"select '{table}' || row_to_json(t)::text as r from public.{table} t where dealer_id = '{dealer_id}'"
        for table in _OWNED
    ]
    parts.append(
        "select 'listings' || id || ':' || coalesce(inventory_product_id::text, '-') as r "
        f"from public.listings where owner_id = '{dealer_id}'"
    )
    union = " union all ".join(parts)
    return sql(f"select md5(coalesce(string_agg(r, '|' order by r), '')) from ({union}) s")


def count_rows(table: str, dealer_id: str) -> int:
    uuid.UUID(dealer_id)
    if table not in _OWNED:
        raise ValueError(table)
    return int(sql(f"select count(*) from public.{table} where dealer_id = '{dealer_id}'"))


def ok(response, status: int = 200):
    assert response.status_code == status, f"{response.request.method} {response.request.url} -> {response.text}"
    return response.json() if response.content else None


def build_dealer_scenario(api_client, dealer: Dealer, category_id: str) -> Dealer:
    """A dealer with two locations, a product with stock and history, a spare product, a supplier, a draft purchase, a
    linked marketplace listing and saved alert settings: one row of every B2 kind, for the refusal tests to aim at."""
    t = dealer.token
    run = uuid.uuid4().hex[:6]
    shop = ok(api_client("POST", f"{INV}/locations", t, json={"name": f"Shop {run}", "kind": "shop"}), 201)
    godown = ok(api_client("POST", f"{INV}/locations", t, json={"name": f"Godown {run}", "kind": "godown"}), 201)
    product = ok(
        api_client(
            "POST",
            f"{INV}/products",
            t,
            json={
                "sku": f"UREA-{run}",
                "name": f"Urea {run}",
                "unit": "bag",
                "cost_price": 3500,
                "reorder_threshold": 5,
            },
        ),
        201,
    )
    spare = ok(api_client("POST", f"{INV}/products", t, json={"sku": f"DAP-{run}", "name": f"DAP {run}"}), 201)
    supplier = ok(api_client("POST", f"{INV}/suppliers", t, json={"name": f"Depot {run}"}), 201)
    stock_in = ok(
        api_client(
            "POST",
            f"{INV}/movements/stock-in",
            t,
            json={"product_id": product["id"], "location_id": shop["id"], "quantity": 20, "reason": "Opening"},
        ),
        201,
    )
    purchase = ok(
        api_client(
            "POST",
            f"{INV}/purchases",
            t,
            json={
                "supplier_id": supplier["id"],
                "reference": f"PO-{run}",
                "items": [{"product_id": product["id"], "location_id": shop["id"], "quantity": 3, "unit_cost": 3400}],
            },
        ),
        201,
    )
    listing = ok(
        api_client(
            "POST",
            "/api/v1/marketplace/listings",
            t,
            json={
                "title": f"Urea listing {run}",
                "price": 3900.0,
                "unit": "bag",
                "quantity": 1,
                "category_id": category_id,
                "brand": "Smoke",
                "condition": "new",
            },
        ),
    )
    ok(api_client("POST", f"{INV}/products/{product['id']}/listings", t, json={"listing_id": listing["id"]}))
    ok(
        api_client(
            "PUT",
            f"{INV}/alerts/settings",
            t,
            json={"default_reorder_threshold": 2, "notify_low_stock": True, "notify_sync_failure": False},
        )
    )
    dealer.ids.update(
        shop=shop["id"],
        godown=godown["id"],
        product=product["id"],
        spare=spare["id"],
        supplier=supplier["id"],
        movement=stock_in["id"],
        purchase=purchase["id"],
        listing=listing["id"],
    )
    return dealer


def endpoints(victim: Dealer) -> list[tuple[str, str, dict | None]]:
    """Every B2 endpoint (and every mounted legacy dealer inventory route), aimed at the victim's rows wherever the
    endpoint takes an id or a reference. Bodies are valid, so a refusal can only come from who is asking."""
    i = victim.ids
    move = {"product_id": i["product"], "location_id": i["shop"], "quantity": 1}
    return [
        # products and SKUs
        ("GET", f"{INV}/products", None),
        ("POST", f"{INV}/products", {"sku": f"X-{uuid.uuid4().hex[:6]}", "name": "Intruder product"}),
        ("GET", f"{INV}/products/{i['product']}", None),
        ("PATCH", f"{INV}/products/{i['product']}", {"name": "Renamed by someone else"}),
        ("DELETE", f"{INV}/products/{i['spare']}", None),
        ("POST", f"{INV}/products/{i['spare']}/listings", {"listing_id": i["listing"]}),
        ("DELETE", f"{INV}/products/{i['product']}/listings/{i['listing']}", None),
        # stock and locations
        ("GET", f"{INV}/stock?product_id={i['product']}", None),
        (
            "POST",
            f"{INV}/stock/transfer",
            {"product_id": i["product"], "from_location_id": i["shop"], "to_location_id": i["godown"], "quantity": 1},
        ),
        ("GET", f"{INV}/locations", None),
        ("POST", f"{INV}/locations", {"name": "Intruder place"}),
        ("GET", f"{INV}/locations/{i['godown']}", None),
        ("PATCH", f"{INV}/locations/{i['godown']}", {"name": "Taken over"}),
        ("DELETE", f"{INV}/locations/{i['godown']}", None),
        # movements
        ("GET", f"{INV}/movements?product_id={i['product']}", None),
        ("GET", f"{INV}/movements/{i['movement']}", None),
        ("POST", f"{INV}/movements/stock-in", move),
        ("POST", f"{INV}/movements/stock-out", {**move, "source": "DAMAGE", "reason": "Torn bag"}),
        ("POST", f"{INV}/movements/adjustment", {**move, "direction": "out", "reason": "Count"}),
        # suppliers and purchases
        ("GET", f"{INV}/suppliers", None),
        ("POST", f"{INV}/suppliers", {"name": "Intruder supplier"}),
        ("GET", f"{INV}/suppliers/{i['supplier']}", None),
        ("PATCH", f"{INV}/suppliers/{i['supplier']}", {"name": "Taken over"}),
        ("DELETE", f"{INV}/suppliers/{i['supplier']}", None),
        ("GET", f"{INV}/purchases", None),
        ("POST", f"{INV}/purchases", {"supplier_id": i["supplier"], "items": []}),
        (
            "POST",
            f"{INV}/purchases",
            {"items": [{"product_id": i["product"], "location_id": i["shop"], "quantity": 1}]},
        ),
        ("GET", f"{INV}/purchases/{i['purchase']}", None),
        ("PATCH", f"{INV}/purchases/{i['purchase']}", {"notes": "Edited by someone else"}),
        ("POST", f"{INV}/purchases/{i['purchase']}/receive", None),
        ("POST", f"{INV}/purchases/{i['purchase']}/cancel", None),
        # alerts and settings
        ("GET", f"{INV}/alerts", None),
        ("GET", f"{INV}/alerts/low-stock", None),
        ("GET", f"{INV}/alerts/out-of-stock", None),
        ("GET", f"{INV}/alerts/settings", None),
        ("PUT", f"{INV}/alerts/settings", {"default_reorder_threshold": 9}),
        # dashboard
        ("GET", f"{INV}/dashboard", None),
        # the legacy dealer routes, served from the IMS tables since B3 (inventory/service.py)
        ("GET", f"{DEALER}/inventory", None),
        ("GET", f"{DEALER}/inventory/listings", None),
        (
            "POST",
            f"{DEALER}/inventory",
            {"listing_id": i["listing"], "stock_quantity": 1, "unit": "bag", "min_stock_threshold": 0},
        ),
        ("GET", f"{DEALER}/inventory/{i['product']}", None),
        ("PATCH", f"{DEALER}/inventory/{i['product']}", {"unit": "sack"}),
        ("DELETE", f"{DEALER}/inventory/{i['product']}", None),
        ("GET", f"{DEALER}/inventory/{i['product']}/transactions", None),
        ("POST", f"{DEALER}/inventory/{i['product']}/adjust", {"type": "sale", "quantity": 1}),
        ("GET", f"{DEALER}/stores", None),
        ("POST", f"{DEALER}/stores", {"name": "Intruder store"}),
        ("GET", f"{DEALER}/stores/{i['godown']}", None),
        ("PATCH", f"{DEALER}/stores/{i['godown']}", {"name": "Taken over"}),
        ("DELETE", f"{DEALER}/stores/{i['godown']}", None),
        ("GET", f"{DEALER}/suppliers", None),
        ("POST", f"{DEALER}/suppliers", {"name": "Intruder supplier"}),
        ("GET", f"{DEALER}/suppliers/{i['supplier']}", None),
        ("PATCH", f"{DEALER}/suppliers/{i['supplier']}", {"name": "Taken over"}),
        ("DELETE", f"{DEALER}/suppliers/{i['supplier']}", None),
    ]


KEYS = ("shop", "godown", "product", "spare", "supplier", "movement", "purchase", "listing")
# The endpoint list with `{key}` in place of each id: a readable test id, and whether a route takes an id.
TEMPLATES = endpoints(Dealer("", "", "", ids={key: "{" + key + "}" for key in KEYS}))
