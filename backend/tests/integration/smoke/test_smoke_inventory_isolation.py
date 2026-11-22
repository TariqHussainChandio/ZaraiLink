"""B2 on the real stack: the dealer inventory is private (BR-03/04; SRDS §15-§16, §50; B0 boundary).

Two approved dealers each hold a full set of IMS rows. For every B2 endpoint, and every legacy dealer inventory route
still mounted, dealer B aims at dealer A's rows: an id route answers 404 or 403, a list holds none of A's rows, a write
that names A's product, location, supplier or listing is refused, and A's rows are byte-for-byte unchanged in the
database afterwards. B's own rows are unchanged by a refused write too (a refused purchase leaves no empty draft
behind). A pending dealer, a farmer, a buyer, an expert and the admin are refused on every endpoint for who they are,
and change nothing.
"""

from __future__ import annotations

import pytest
from conftest import make_user
from inventory_world import TEMPLATES, approved_dealer, build_dealer_scenario, endpoints, fingerprint, ok


@pytest.fixture(scope="module")
def dealers(world, api_client, backend_url):
    a = build_dealer_scenario(api_client, approved_dealer(backend_url, world.admin.token), world.category_id)
    b = build_dealer_scenario(api_client, approved_dealer(backend_url, world.admin.token), world.category_id)
    return a, b


def _a_ids(a) -> set[str]:
    return set(a.ids.values())


# The routes where dealer B creates a row of their own (no reference to A in the body).
_OWN_CREATES = (
    "/inventory/products",
    "/inventory/locations",
    "/inventory/suppliers",
    "/alerts/settings",
    "/dealer/stores",
    "/dealer/suppliers",
)


@pytest.mark.parametrize("index", range(len(TEMPLATES)), ids=[f"{m} {p}" for m, p, _ in TEMPLATES])
def test_dealer_b_cannot_read_or_change_dealer_a_rows(index, dealers, api_client):
    a, b = dealers
    method, path, body = endpoints(a)[index]
    template = TEMPLATES[index][1].split("?", 1)[0]
    before_a, before_b = fingerprint(a.id), fingerprint(b.id)

    response = api_client(method, path, b.token, **({"json": body} if body is not None else {}))

    names_a = body is not None and any(v in _a_ids(a) for v in body.values() if isinstance(v, str))
    creates_own_row = method in ("POST", "PUT") and template.endswith(_OWN_CREATES) and not names_a
    if method == "GET" and "{" not in template:
        # a list or a figure: allowed for B, about B only
        assert response.status_code == 200, response.text
        leaked = [i for i in _a_ids(a) if i in response.text]
        assert not leaked, f"{method} {path} showed dealer A's rows to dealer B: {leaked}"
    elif creates_own_row:
        # B may create their own row; it is B's, never A's
        assert response.status_code in (200, 201), response.text
        assert a.id not in response.text
    else:
        assert response.status_code in (403, 404), (
            f"{method} {path} as dealer B -> {response.status_code} {response.text}"
        )

    assert fingerprint(a.id) == before_a, f"{method} {path} by dealer B changed dealer A's rows"
    if not creates_own_row:
        assert fingerprint(b.id) == before_b, f"{method} {path}: a refused call changed dealer B's own rows"


def test_dealer_b_cannot_link_their_product_to_dealer_a_listing_or_move_stock_into_a_location(dealers, api_client):
    """The mixed cases: B's own product with A's listing, location or supplier."""
    a, b = dealers
    before_a, before_b = fingerprint(a.id), fingerprint(b.id)
    inv = "/api/v1/inventory"
    attempts = [
        ("POST", f"{inv}/products/{b.ids['product']}/listings", {"listing_id": a.ids["listing"]}),
        (
            "POST",
            f"{inv}/movements/stock-in",
            {"product_id": b.ids["product"], "location_id": a.ids["shop"], "quantity": 1},
        ),
        (
            "POST",
            f"{inv}/stock/transfer",
            {
                "product_id": b.ids["product"],
                "from_location_id": b.ids["shop"],
                "to_location_id": a.ids["shop"],
                "quantity": 1,
            },
        ),
        (
            "POST",
            f"{inv}/purchases",
            {
                "supplier_id": a.ids["supplier"],
                "items": [{"product_id": b.ids["product"], "location_id": b.ids["shop"], "quantity": 1}],
            },
        ),
        (
            "POST",
            f"{inv}/purchases",
            {"items": [{"product_id": b.ids["product"], "location_id": a.ids["shop"], "quantity": 1}]},
        ),
        ("PATCH", f"{inv}/purchases/{b.ids['purchase']}", {"supplier_id": a.ids["supplier"]}),
        (
            "PATCH",
            f"{inv}/purchases/{b.ids['purchase']}",
            {"items": [{"product_id": a.ids["product"], "location_id": b.ids["shop"], "quantity": 1}]},
        ),
    ]
    for method, path, body in attempts:
        response = api_client(method, path, b.token, json=body)
        assert response.status_code in (403, 404), f"{method} {path} {body} -> {response.status_code} {response.text}"
        assert fingerprint(a.id) == before_a, f"{method} {path} changed dealer A's rows"
        assert fingerprint(b.id) == before_b, f"{method} {path}: a refused call changed dealer B's own rows"


@pytest.fixture(scope="module")
def outsiders(world):
    return {
        "dealer_pending": (make_user("dealer")[2], "account_not_approved"),
        "farmer": (world.farmer.token, "insufficient_role"),
        "buyer": (world.buyer.token, "insufficient_role"),
        "expert": (world.expert.token, "insufficient_role"),
        "admin": (world.admin.token, "insufficient_role"),
    }


@pytest.mark.parametrize("actor", ["dealer_pending", "farmer", "buyer", "expert", "admin"])
def test_only_an_approved_dealer_reaches_the_inventory(actor, dealers, outsiders, api_client):
    a, _ = dealers
    token, code = outsiders[actor]
    before = fingerprint(a.id)
    for method, path, body in endpoints(a):
        response = api_client(method, path, token, **({"json": body} if body is not None else {}))
        assert response.status_code == 403, f"{method} {path} as {actor} -> {response.status_code} {response.text}"
        assert response.json()["code"] == code, f"{method} {path} as {actor}: {response.text}"
    assert fingerprint(a.id) == before, f"a refused {actor} changed dealer A's rows"


def test_dealer_a_still_reaches_every_row_after_the_attacks(dealers, api_client):
    """The rows the attacks aimed at are intact and still the owner's."""
    a, _ = dealers
    inv = "/api/v1/inventory"
    product = ok(api_client("GET", f"{inv}/products/{a.ids['product']}", a.token))
    assert product["name"].startswith("Urea ")
    assert [listing["id"] for listing in product["listings"]] == [a.ids["listing"]]
    assert product["total_quantity"] == 20
    assert ok(api_client("GET", f"{inv}/purchases/{a.ids['purchase']}", a.token))["status"] == "draft"
    assert ok(api_client("GET", f"{inv}/suppliers/{a.ids['supplier']}", a.token))["name"].startswith("Depot ")
    assert ok(api_client("GET", f"{inv}/locations/{a.ids['godown']}", a.token))["is_active"] is True
    assert ok(api_client("GET", f"{inv}/alerts/settings", a.token))["default_reorder_threshold"] == 2
