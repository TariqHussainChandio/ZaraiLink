"""A7 exit (SRDS §14, §15; BR-03/04, BR-15; B0 boundary): the admin console never reaches dealer inventory, and every
admin write is refused to a non-admin and to an admin without a second factor.

The admin is a fresh one, signed in twice: `aal1` (password only) and `aal2` (after verifying a TOTP factor), so each
proof runs with both sessions of the same person. A dealer with one row of every inventory kind is the target.

1. Every inventory endpoint (the IMS and the legacy dealer routes) answers 403 `insufficient_role` to the admin, at
   aal1 and aal2, and the dealer's rows are byte-for-byte unchanged (the dealer reaching the same rows is the allowed
   path).
2. Every GET the admin can call (the admin router, and any other route that admits the admin role) answers without a
   single id or name of the dealer's inventory in it.
3. The admin's own token, sent straight to the Data API, reads no inventory row, changes none, and lists no inventory
   export file; and no row-level policy on an inventory table mentions an admin at all.
4. Two-user proofs on every admin-reachable write: a buyer is refused for their role, the aal1 admin is refused for the
   missing second factor on every second-factor route (and on the dispute resolution, which is an admin write on a
   participant route), and none of the refusals leaves an audit row.
"""

from __future__ import annotations

import base64
import json
import os
import uuid
from typing import ClassVar

import httpx
import pytest
from conftest import enrol_totp_and_get_aal2_token, make_user, promote_to_admin
from inventory_world import _OWNED, INV, approved_dealer, build_dealer_scenario, endpoints, fingerprint, ok, sql
from pydantic import ValidationError
from route_walk import api_routes

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")
for _name, _value in (
    ("SUPABASE_URL", LOCAL_URL),
    ("SUPABASE_ANON_KEY", ANON_KEY),
    ("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY),
):
    if _value:
        os.environ.setdefault(_name, _value)

try:
    from app.auth.dependencies import declared_roles, require_admin_aal2
    from app.main import app
except ValidationError:
    app = None

# Every table of the dealer's Inventory Management System (B1), including the sync log the marketplace writes into.
INVENTORY_TABLES = (*_OWNED, "inventory_sync_log")


def _sub(token: str) -> str:
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))["sub"]


@pytest.fixture(scope="module")
def admin_sessions() -> dict[str, str]:
    """One admin, two sessions: the password-only token and the token after a verified second factor."""
    admin_id, _, aal1 = make_user("buyer")  # promoted below; an admin is never self-selected
    promote_to_admin(admin_id)
    return {"id": admin_id, "aal1": aal1, "aal2": enrol_totp_and_get_aal2_token(aal1)}


@pytest.fixture(scope="module")
def dealer(world, api_client, backend_url):
    return build_dealer_scenario(api_client, approved_dealer(backend_url, world.admin.token), world.category_id)


def _secrets(dealer) -> list[str]:
    """What must never appear in an admin answer: every inventory row id of the dealer, and the product's SKU."""
    inventory_ids = [v for k, v in dealer.ids.items() if k != "listing"]
    sku = sql(f"select sku from public.inventory_products where id = '{uuid.UUID(dealer.ids['product'])}'")
    return [*inventory_ids, sku]


# --- 1. the inventory API refuses the admin


@pytest.mark.parametrize("session", ["aal1", "aal2"])
def test_the_admin_is_refused_on_every_inventory_endpoint(session, admin_sessions, dealer, api_client):
    token = admin_sessions[session]
    before = fingerprint(dealer.id)
    for method, path, body in endpoints(dealer):
        response = api_client(method, path, token, **({"json": body} if body is not None else {}))
        assert response.status_code == 403, f"{method} {path} as the {session} admin -> {response.status_code}"
        assert response.json()["code"] == "insufficient_role", f"{method} {path}: {response.text}"
    assert fingerprint(dealer.id) == before, f"a refused {session} admin changed the dealer's inventory"
    # The allowed path, same rows: the owner still reads their product.
    assert ok(api_client("GET", f"{INV}/products/{dealer.ids['product']}", dealer.token))["id"] == dealer.ids["product"]


# --- 2. no admin read carries inventory data


def _walk(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _walk(sub)


def _admits_admin(route) -> bool:
    calls = list(_walk(route.dependant))
    return require_admin_aal2 in calls or any("admin" in declared_roles.get(call, ()) for call in calls)


def _fill(path: str, dealer) -> str:
    """Real ids where the admin may legitimately look (the dealer's own application); a made-up one elsewhere."""
    values = {
        "dealer_id": dealer.id,
        "profile_id": dealer.id,
        "listing_id": dealer.ids["listing"],
        "table": "units",
        "class_label": "Tomato___Early_blight",
    }
    while "{" in path:
        start, end = path.index("{"), path.index("}")
        name = path[start + 1 : end]
        path = path[:start] + values.get(name, str(uuid.uuid4())) + path[end + 1 :]
    return path


def test_no_admin_read_returns_any_inventory_data(admin_sessions, dealer, api_client):
    if app is None:
        pytest.skip("no Supabase settings in this environment")
    reads = sorted(
        {route.path for route in api_routes(app) if "GET" in route.methods and _admits_admin(route)}
        - {"/api/v1/admin/dealer-applications/{dealer_id}/documents/{document_id}/url"}  # a signed file link, no rows
    )
    assert "/api/v1/admin/queues" in reads
    assert "/api/v1/analytics/admin" in reads
    secrets = _secrets(dealer)
    for template in reads:
        if template.startswith(("/api/v1/inventory", "/api/v1/dealer/inventory")):
            continue  # proven refused above
        for session in ("aal1", "aal2"):
            response = api_client("GET", _fill(template, dealer), admin_sessions[session])
            assert response.status_code < 500, f"GET {template} -> {response.status_code} {response.text}"
            leaked = [s for s in secrets if s in response.text]
            assert not leaked, f"GET {template} showed the {session} admin the dealer's inventory: {leaked}"


# --- 3. the Data API holds nothing for the admin either


def _data_api(method: str, path: str, token: str, **kw) -> httpx.Response:
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Prefer": "return=representation"}
    return httpx.request(method, f"{LOCAL_URL}{path}", headers=headers, timeout=30, **kw)


@pytest.mark.parametrize("session", ["aal1", "aal2"])
def test_the_admin_token_reads_and_changes_no_inventory_row_directly(session, admin_sessions, dealer):
    token = admin_sessions[session]
    before = fingerprint(dealer.id)
    for table in INVENTORY_TABLES:
        read = _data_api("GET", f"/rest/v1/{table}?select=*&limit=50", token)
        assert read.status_code in (200, 401, 403), f"{table}: {read.status_code} {read.text}"
        if read.status_code == 200:
            assert read.json() == [], f"the {session} admin read {table}: {read.text[:200]}"
        changed = _data_api("PATCH", f"/rest/v1/{table}?dealer_id=eq.{dealer.id}", token, json={"dealer_id": dealer.id})
        assert changed.status_code in (200, 401, 403, 404), f"{table}: {changed.status_code} {changed.text}"
        if changed.status_code == 200:
            assert changed.json() == [], f"the {session} admin updated {table}"
        deleted = _data_api("DELETE", f"/rest/v1/{table}?dealer_id=eq.{dealer.id}", token)
        assert deleted.status_code in (200, 401, 403, 404), f"{table}: {deleted.status_code} {deleted.text}"
        if deleted.status_code == 200:
            assert deleted.json() == [], f"the {session} admin deleted from {table}"
    assert fingerprint(dealer.id) == before
    # The allowed path through the same door: the dealer reads their own product row.
    own = _data_api("GET", f"/rest/v1/inventory_products?id=eq.{dealer.ids['product']}&select=id", dealer.token)
    assert own.status_code == 200, own.text
    assert own.json() == [{"id": dealer.ids["product"]}]


@pytest.mark.parametrize("session", ["aal1", "aal2"])
def test_the_admin_lists_no_inventory_export(session, admin_sessions, dealer):
    listed = _data_api(
        "POST", "/storage/v1/object/list/inventory-exports", admin_sessions[session], json={"prefix": dealer.id}
    )
    assert listed.status_code in (200, 400, 403, 404), listed.text
    if listed.status_code == 200:
        assert listed.json() == [], f"the {session} admin listed the dealer's exports"


def test_no_inventory_policy_mentions_an_admin():
    tables = ", ".join(f"'{t}'" for t in INVENTORY_TABLES)
    rows = sql(
        "select tablename || ':' || policyname from pg_policies where schemaname = 'public' "
        f"and tablename in ({tables}) "
        "and (coalesce(qual, '') ilike '%admin%' or coalesce(with_check, '') ilike '%admin%')"
    )
    assert rows == "", f"an inventory policy names an admin: {rows}"
    storage = sql(
        "select policyname from pg_policies where schemaname = 'storage' "
        "and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%inventory-exports%' "
        "and (coalesce(qual, '') || coalesce(with_check, '')) ilike '%admin%'"
    )
    assert storage == "", f"an inventory export policy names an admin: {storage}"


# --- 4. two-user proofs on every admin write


def _admin_writes() -> list[tuple[str, str, bool]]:
    return sorted(
        (method, route.path, require_admin_aal2 in list(_walk(route.dependant)))
        for route in api_routes(app)
        if _admits_admin(route)
        for method in route.methods - {"GET"}
    )


def _audit_count(actor_id: str) -> int:
    response = httpx.get(
        f"{LOCAL_URL}/rest/v1/audit_logs",
        params={"actor_id": f"eq.{actor_id}", "select": "id"},
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        timeout=30,
    )
    response.raise_for_status()
    return len(response.json())


def test_a_non_admin_is_refused_on_every_admin_write(api_client, make_actor):
    if app is None:
        pytest.skip("no Supabase settings in this environment")
    buyer_id, _, buyer_token = make_actor("buyer")
    writes = _admin_writes()
    assert len(writes) >= 20
    for method, path, _ in writes:
        response = api_client(method, _fill(path, _Blank), buyer_token, json={})
        assert response.status_code == 403, f"{method} {path} let a buyer through: {response.status_code}"
        assert response.json()["code"] == "insufficient_role", f"{method} {path}: {response.text}"
    assert _audit_count(buyer_id) == 0


def test_an_admin_without_a_second_factor_is_refused_on_every_second_factor_write(admin_sessions, api_client):
    if app is None:
        pytest.skip("no Supabase settings in this environment")
    second_factor = [(m, p) for m, p, needs_aal2 in _admin_writes() if needs_aal2]
    # Every admin-only write demands the second factor; the only admin-reachable writes without it are routes shared
    # with other roles, and there are none today.
    assert second_factor == [(m, p) for m, p, _ in _admin_writes()]
    audited_before = _audit_count(admin_sessions["id"])
    for method, path in second_factor:
        response = api_client(method, _fill(path, _Blank), admin_sessions["aal1"], json={})
        assert response.status_code == 403, f"{method} {path} let an aal1 admin write: {response.status_code}"
        assert response.json()["code"] == "mfa_required", f"{method} {path}: {response.text}"
    assert _audit_count(admin_sessions["id"]) == audited_before


def test_resolving_a_dispute_needs_the_second_factor_too(world, admin_sessions, api_client):
    """The dispute is settled on the participant status route, so the route walk above cannot see it. The aal1 admin is
    refused and the order stays disputed; the aal2 admin then settles it (the allowed path, same order)."""
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    for token, to_status in (
        (world.farmer.token, "confirmed"),
        (world.farmer.token, "processing"),
        (world.farmer.token, "ready"),
        (world.farmer.token, "dispatched"),
        (world.farmer.token, "completed"),
        (world.buyer.token, "disputed"),
    ):
        assert (
            api_client("PATCH", f"/api/v1/orders/{order_id}/status", token, json={"to": to_status}).status_code == 204
        )
    path = f"/api/v1/orders/{order_id}/status"
    audited_before = _audit_count(admin_sessions["id"])
    # A complete, valid body (with the reason a settlement needs), so the only thing missing is the second factor.
    body = {"to": "refunded", "reason": "Goods arrived damaged"}
    refused = api_client("PATCH", path, admin_sessions["aal1"], json=body)
    assert refused.status_code == 403, f"an aal1 admin settled a dispute: {refused.status_code} {refused.text}"
    assert refused.json()["code"] == "mfa_required", refused.text
    assert ok(api_client("GET", f"/api/v1/orders/{order_id}", world.buyer.token))["status"] == "disputed"
    assert _audit_count(admin_sessions["id"]) == audited_before
    assert api_client("PATCH", path, admin_sessions["aal2"], json=body).status_code == 204


def test_a_disease_knowledge_write_without_a_second_factor_or_the_role_is_refused(world, admin_sessions, api_client):
    label = api_client("GET", "/api/v1/admin/disease-knowledge", world.admin.token).json()[0]["class_label"]
    farmer_id, _, farmer_token = make_user("farmer")
    for token, code in ((farmer_token, "insufficient_role"), (admin_sessions["aal1"], "mfa_required")):
        refused = api_client("POST", f"/api/v1/admin/disease-knowledge/{label}/review", token)
        assert refused.status_code == 403, refused.text
        assert refused.json()["code"] == code
    assert _audit_count(farmer_id) == 0


class _Blank:
    """Stand-in dealer for the write walk: every id is made up, since each refusal comes before any lookup."""

    id: ClassVar[str] = str(uuid.uuid4())
    ids: ClassVar[dict[str, str]] = {"listing": str(uuid.uuid4())}
