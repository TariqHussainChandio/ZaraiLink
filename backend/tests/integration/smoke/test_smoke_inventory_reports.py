"""B5 on the real stack: the reports add up to the ledger over a scripted month, the exports open, and nobody but the
owning approved dealer reaches either (SRDS §17, §18, §24, §25, §45-§46; BR-03/04; docs/plan-inventory.md B5 exit).

A fresh dealer runs a month of business through the real API: an opening stock before the month, then a purchase
received from a supplier, local sales, two marketplace orders dispatched through the real order route (the dispatch
transaction takes the stock, as in test_smoke_inventory_sync.py), adjustments both ways, damage, expiry, a transfer
between the dealer's own places, a restock and own use. After each step the rows that step wrote are dated back to its
day as the database owner (the ledger stamps `now()`; there is no API to backdate, rightly), in order, so each
movement's running balance stays true.

Every report is then checked against the figures the script implies (computed here, not read back from the API) and
against the ledger read as the database owner. The SRDS §25 identity is checked for every product, over the whole
ledger and over the period: opening + marketplace + local + adjustments + restocks and purchases (+ losses, transfers
and other) = closing = stock on hand.

Each export is requested as the dealer, its signed link followed with plain HTTP (no token), and the CSV parsed back
and compared with the report, cell by cell. Names carry commas, quotes, a newline, Urdu and formula characters on
purpose. Then the two-user proofs: another dealer, a pending dealer, a farmer, a buyer, an expert and the admin are
refused, through the API and straight through Storage, and a link fails once it has expired or is pointed at another
file.
"""

from __future__ import annotations

import base64
import csv
import io
import json
import os
import time
import unicodedata
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta

import httpx
import pytest
from conftest import sign_in
from inventory_world import INV, Dealer, approved_dealer, ok, sql

ORDERS = "/api/v1/orders"
STORAGE = os.environ.get("LOCAL_SUPABASE_URL", "") + "/storage/v1"
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")
BUCKET = "inventory-exports"
REPORTS = [
    "stock-summary",
    "valuation",
    "movements-by-source",
    "low-out-of-stock",
    "supplier-purchases",
    "sales-split",
    "analytics",
    "reconciliation",
]
FORMULA = ("=", "+", "-", "@")
# Characters a spreadsheet skips before the first one it reads: Unicode spaces, separators, control and format
# characters.
INVISIBLE = ("Zs", "Zl", "Zp", "Cc", "Cf")
# POST /exports allows ten a minute per session (exports.EXPORTS_PER_MINUTE); the tests sign in again before then.
EXPORTS_PER_SESSION = 9
TODAY = datetime.now(UTC).date()
START = TODAY - timedelta(days=29)


# --- the scripted month -----------------------------------------------------------------------------------------------


@dataclass
class Month:
    dealer: Dealer
    names: dict[str, str] = field(default_factory=dict)
    exports: dict[str, dict] = field(default_factory=dict)
    export_token: str = ""
    exports_made: int = 0
    own_file: str = ""


# Every dealer whose export files this module makes; the files are removed at the end (B5 verification F2: leftovers
# in the bucket turned zl-db's pgTAP suite red).
_EXPORT_FOLDERS: set[str] = set()
_SERVICE = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def _remove_exports(folder: str) -> None:
    """Every file in one dealer's export folder, removed through the Storage API with the service role."""
    while True:
        listed = httpx.post(
            f"{STORAGE}/object/list/{BUCKET}",
            headers=_SERVICE,
            json={"prefix": f"{folder}/", "limit": 1000},
            timeout=30,
        )
        listed.raise_for_status()
        paths = [f"{folder}/{item['name']}" for item in listed.json() if item.get("id")]
        if not paths:
            return
        removed = httpx.request(
            "DELETE", f"{STORAGE}/object/{BUCKET}", headers=_SERVICE, json={"prefixes": paths}, timeout=30
        )
        removed.raise_for_status()


@pytest.fixture(scope="module", autouse=True)
def _sweep_exports():
    yield
    for folder in _EXPORT_FOLDERS:
        _remove_exports(folder)
    left = sql(
        f"select count(*) from storage.objects where bucket_id = '{BUCKET}' "
        f"and (storage.foldername(name))[1] = any(array[{','.join(repr(f) for f in _EXPORT_FOLDERS) or 'null'}])"
    )
    assert left == "0", f"{left} export files left behind"


def _uuid(value: str) -> str:
    return str(uuid.UUID(value))


def _date_back(dealer_id: str, day: date) -> None:
    """Dates the rows the last step wrote (stamped within the last hour; every earlier step's rows are already dated
    back) to noon of `day`. A step on today keeps its real time, so nothing is dated into the future."""
    if day == TODAY:
        return
    stamp = datetime(day.year, day.month, day.day, 12, tzinfo=UTC).isoformat()
    did = _uuid(dealer_id)
    sql(
        f"update public.inventory_movements set created_at = '{stamp}' "
        f"where dealer_id = '{did}' and created_at > now() - interval '1 hour'"
    )
    sql(
        f"update public.inventory_purchases set received_at = '{stamp}' "
        f"where dealer_id = '{did}' and received_at > now() - interval '1 hour'"
    )


def _day(offset: int) -> date:
    return TODAY - timedelta(days=offset)


@pytest.fixture(scope="module")
def month(world, backend_url, api_client) -> Month:
    d = approved_dealer(backend_url, world.admin.token)
    _EXPORT_FOLDERS.add(d.id)
    t = d.token
    run = uuid.uuid4().hex[:6]

    def post(path: str, body: dict | None = None, status: int = 201) -> dict:
        return ok(api_client("POST", f"{INV}{path}", t, json=body), status)

    # Free text the dealer typed, chosen to break a careless CSV: a comma and quotes, a newline, Urdu, and cells a
    # spreadsheet would run as formulas.
    names = {
        "shop": f"Shop, Main {run}",
        # behind a space and a zero-width space, a fullwidth equals sign: still a formula to a spreadsheet (F6)
        "godown": f" {chr(0x200B)}{chr(0xFF1D)}Godown {run}",
        "supplier": f"@Depot {run}",
        "p1": f'یوریا, کھاد "خاص" {run}',
        "p2": f"DAP\n50 kg {run}",
        "p3": f"-Seeds {run}",
        "p1_sku": f"=UREA-{run}",
        "p2_sku": f"+DAP-{run}",
        "p3_sku": f"@SEED-{run}",
    }
    shop = post("/locations", {"name": names["shop"], "kind": "shop"})
    assert shop["is_default"], shop  # the first location is the default the marketplace sells from (D8)
    godown = post("/locations", {"name": names["godown"], "kind": "godown"})
    supplier = post("/suppliers", {"name": names["supplier"]})
    p1 = post(
        "/products",
        {"sku": names["p1_sku"], "name": names["p1"], "unit": "bag", "cost_price": 3500, "reorder_threshold": 5},
    )
    p2 = post("/products", {"sku": names["p2_sku"], "name": names["p2"], "unit": "bag", "cost_price": 4200.4})
    p3 = post("/products", {"sku": names["p3_sku"], "name": names["p3"], "unit": "kg", "reorder_threshold": 50})
    d.ids.update(shop=shop["id"], godown=godown["id"], supplier=supplier["id"], p1=p1["id"], p2=p2["id"], p3=p3["id"])

    def stock_in(pid: str, qty: float) -> None:
        post(
            "/movements/stock-in", {"product_id": pid, "location_id": shop["id"], "quantity": qty, "reason": "Restock"}
        )

    def stock_out(pid: str, source: str, qty: float, reason: str | None = None) -> None:
        body = {"product_id": pid, "location_id": shop["id"], "source": source, "quantity": qty, "reason": reason}
        post("/movements/stock-out", body)

    def adjust(pid: str, direction: str, qty: float) -> None:
        body = {
            "product_id": pid,
            "location_id": shop["id"],
            "direction": direction,
            "quantity": qty,
            "reason": "Count",
        }
        post("/movements/adjustment", body)

    def listing(pid: str) -> str:
        made = ok(
            api_client(
                "POST",
                "/api/v1/marketplace/listings",
                t,
                json={
                    "title": f"Report listing {uuid.uuid4().hex[:6]}",
                    "price": 100.0,
                    "unit": "bag",
                    "quantity": 100,
                    "category_id": world.category_id,
                    "brand": "Smoke",
                    "condition": "new",
                },
            )
        )
        ok(api_client("POST", f"{INV}/products/{pid}/listings", t, json={"listing_id": made["id"]}))
        return made["id"]

    def order_and_dispatch(*lines: tuple[str, float]) -> None:
        cart = [{"listing_id": lid, "quantity": qty} for lid, qty in lines]
        orders = ok(api_client("POST", f"{ORDERS}/checkout", world.buyer.token, json={"cart_items": cart}))
        assert len(orders) == 1, orders
        for step in ("confirmed", "processing", "ready", "dispatched"):
            moved = api_client("PATCH", f"{ORDERS}/{orders[0]['id']}/status", t, json={"to": step})
            assert moved.status_code == 204, moved.text

    l1, l2 = listing(p1["id"]), listing(p2["id"])

    # The opening stock, before the month.
    stock_in(p1["id"], 100)
    stock_in(p2["id"], 50)
    _date_back(d.id, _day(40))
    # A purchase from the supplier, received; one line has no unit cost.
    purchase = post(
        "/purchases",
        {
            "supplier_id": supplier["id"],
            "reference": f"PO-{run}",
            "items": [
                {"product_id": p1["id"], "location_id": shop["id"], "quantity": 40, "unit_cost": 3400},
                {"product_id": p2["id"], "location_id": shop["id"], "quantity": 20, "unit_cost": 4100.25},
                {"product_id": p3["id"], "location_id": shop["id"], "quantity": 30},
            ],
        },
    )
    ok(api_client("POST", f"{INV}/purchases/{purchase['id']}/receive", t))
    _date_back(d.id, _day(28))
    stock_out(p1["id"], "LOCAL_SALE", 15.5)
    _date_back(d.id, _day(25))
    order_and_dispatch((l1, 7), (l2, 3))
    _date_back(d.id, _day(20))
    adjust(p1["id"], "out", 2)
    adjust(p2["id"], "in", 1.25)
    _date_back(d.id, _day(15))
    stock_out(p1["id"], "DAMAGE", 3, "Torn bags")
    stock_out(p2["id"], "EXPIRY", 4, "Past its date")
    _date_back(d.id, _day(12))
    post(
        "/stock/transfer",
        {"product_id": p1["id"], "from_location_id": shop["id"], "to_location_id": godown["id"], "quantity": 10},
    )
    _date_back(d.id, _day(10))
    stock_in(p3["id"], 10)
    stock_out(p3["id"], "LOCAL_SALE", 5.25)
    stock_out(p2["id"], "OTHER", 1, "Own use")
    _date_back(d.id, _day(5))
    order_and_dispatch((l2, 2))  # today: keeps its real time

    return Month(dealer=d, names=names)


def _report(api_client, m: Month, name: str, token: str | None = None) -> dict:
    query = "" if name == "reconciliation" else f"?from={START.isoformat()}&to={TODAY.isoformat()}"
    return ok(api_client("GET", f"{INV}/reports/{name}{query}", token or m.dealer.token))


def _ledger(dealer_id: str, before: date | None = None) -> dict[str, float]:
    """The signed sum of the ledger per product, as the database owner, optionally before a day."""
    bound = f"and created_at < '{before.isoformat()}T00:00:00+00:00'" if before else ""
    out = sql(
        "select product_id, sum(case direction when 'in' then quantity else -quantity end) "
        f"from public.inventory_movements where dealer_id = '{_uuid(dealer_id)}' {bound} group by product_id"
    )
    return {line.split("|")[0]: float(line.split("|")[1]) for line in out.splitlines()} if out else {}


def _stock(dealer_id: str) -> dict[str, float]:
    out = sql(
        "select product_id, sum(quantity) from public.inventory_stock "
        f"where dealer_id = '{_uuid(dealer_id)}' group by product_id"
    )
    return {line.split("|")[0]: float(line.split("|")[1]) for line in out.splitlines()}


# --- every report matches the script and the ledger -------------------------------------------------------------------


def test_stock_on_hand_matches_the_script_and_the_ledger(api_client, month):
    i = month.dealer.ids
    summary = _report(api_client, month, "stock-summary")
    rows = {(r["product_id"], r["location_id"]): r for r in summary["rows"]}
    expected = {
        # product, location: quantity, units in, units out in the month (transfers count: they move a location's stock)
        (i["p1"], i["shop"]): (102.5, 40, 37.5),
        (i["p1"], i["godown"]): (10, 10, 0),
        (i["p2"], i["shop"]): (61.25, 21.25, 10),
        (i["p3"], i["shop"]): (34.75, 40, 5.25),
    }
    assert {key: (r["quantity"], r["period_in"], r["period_out"]) for key, r in rows.items()} == expected
    assert summary["total_quantity"] == 208.5
    assert rows[(i["p1"], i["godown"])]["location_name"] == month.names["godown"]
    assert rows[(i["p1"], i["shop"])]["name"] == month.names["p1"]
    # the stock on hand is the ledger's sum, product by product
    assert _stock(month.dealer.id) == _ledger(month.dealer.id) == {i["p1"]: 112.5, i["p2"]: 61.25, i["p3"]: 34.75}


def test_the_reconciliation_identity_holds_for_every_product(api_client, month):
    """SRDS §25 over the whole ledger, and over the month: opening + every source's net in the month = closing."""
    i = month.dealer.ids
    recon = _report(api_client, month, "reconciliation")
    assert recon["unbalanced"] == 0
    rows = {r["product_id"]: r for r in recon["rows"]}
    assert set(rows) == {i["p1"], i["p2"], i["p3"]}
    terms = (
        "marketplace_sales",
        "local_sales",
        "adjustments",
        "restocks_and_purchases",
        "losses",
        "transfers",
        "other",
    )
    expected = {
        i["p1"]: (-7, -15.5, -2, 140, -3, 0, 0, 112.5),
        i["p2"]: (-5, 0, 1.25, 70, -4, 0, -1, 61.25),
        i["p3"]: (0, -5.25, 0, 40, 0, 0, 0, 34.75),
    }
    stock = _stock(month.dealer.id)
    for pid, row in rows.items():
        assert (*(row[t] for t in terms), row["current_stock"]) == expected[pid], pid
        assert round(sum(row[t] for t in terms), 2) == row["ledger_total"] == row["current_stock"] == stock[pid]
        assert row["balanced"] is True

    # Over the month: the opening (the ledger before the first day) plus the month's ins and outs, read from the stock
    # summary, is the closing, which is the stock on hand.
    opening = _ledger(month.dealer.id, before=START)
    assert opening == {i["p1"]: 100, i["p2"]: 50}
    summary = _report(api_client, month, "stock-summary")
    for pid in (i["p1"], i["p2"], i["p3"]):
        moved = sum(r["period_in"] - r["period_out"] for r in summary["rows"] if r["product_id"] == pid)
        closing = sum(r["quantity"] for r in summary["rows"] if r["product_id"] == pid)
        assert round(opening.get(pid, 0) + moved, 2) == closing == stock[pid], pid


def test_movements_by_source_match_the_script(api_client, month):
    rows = {
        r["source"]: (r["in"], r["out"], r["net"], r["movements"])
        for r in _report(api_client, month, "movements-by-source")["rows"]
    }
    assert rows == {
        "ZARAILINK_ORDER": (0, 12, -12, 3),
        "LOCAL_SALE": (0, 20.75, -20.75, 2),
        "PURCHASE": (90, 0, 90, 3),
        "RESTOCK": (10, 0, 10, 1),
        "MANUAL_ADJUSTMENT": (1.25, 2, -0.75, 2),
        "DAMAGE": (0, 3, -3, 1),
        "EXPIRY": (0, 4, -4, 1),
        "TRANSFER": (10, 10, 0, 2),
        "OTHER": (0, 1, -1, 1),
    }
    # and the same totals straight from the ledger, as the database owner
    did = _uuid(month.dealer.id)
    out = sql(
        "select source, count(*), sum(case direction when 'in' then quantity else -quantity end) "
        f"from public.inventory_movements where dealer_id = '{did}' and created_at >= '{START.isoformat()}' "
        "group by source"
    )
    for line in out.splitlines():
        source, count, net = line.split("|")
        assert (rows[source][3], rows[source][2]) == (int(count), float(net)), source


def test_valuation_matches_the_script(api_client, month):
    i = month.dealer.ids
    value = _report(api_client, month, "valuation")
    rows = {
        r["product_id"]: (r["quantity"], r["cost_price"], r["value"], r["period_in"], r["period_out"])
        for r in value["rows"]
    }
    assert rows == {
        # transfers are not in or out of the business, so they are left out here
        i["p1"]: (112.5, 3500, 393750, 40, 27.5),
        i["p2"]: (61.25, 4200.4, 257274.5, 21.25, 10),
        i["p3"]: (34.75, None, None, 40, 5.25),
    }
    assert (value["total_value"], value["products_without_cost"]) == (651024.5, 1)


def test_low_stock_matches_the_script(api_client, month):
    i = month.dealer.ids
    low = _report(api_client, month, "low-out-of-stock")
    assert (low["low_stock"], low["out_of_stock"]) == (1, 0)
    [row] = low["rows"]
    assert (row["product_id"], row["status"], row["location_id"]) == (i["p3"], "low_stock", i["shop"])
    assert (row["quantity"], row["reorder_threshold"], row["period_out"]) == (34.75, 50, 5.25)
    assert (row["daily_out"], row["days_of_cover"]) == (0.175, 198.6)


def test_supplier_purchases_match_the_script(api_client, month):
    bought = _report(api_client, month, "supplier-purchases")
    assert bought["rows"] == [
        {
            "supplier_id": month.dealer.ids["supplier"],
            "supplier_name": month.names["supplier"],
            "purchases": 1,
            "quantity": 90,
            "cost": 218005,
            "lines_without_cost": 1,
        }
    ]
    assert (bought["total_purchases"], bought["total_quantity"], bought["total_cost"]) == (1, 90, 218005)


def test_marketplace_and_local_sales_match_the_script(api_client, month):
    i = month.dealer.ids
    split = _report(api_client, month, "sales-split")
    assert (split["marketplace_total"], split["local_total"]) == (12, 20.75)
    assert [(r["product_id"], r["marketplace"], r["local"], r["total"]) for r in split["by_product"]] == [
        (i["p1"], 7, 15.5, 22.5),
        (i["p3"], 0, 5.25, 5.25),
        (i["p2"], 5, 0, 5),
    ]
    days = {r["date"]: (r["marketplace"], r["local"]) for r in split["by_day"]}
    assert len(days) == 30
    assert {day: v for day, v in days.items() if v != (0, 0)} == {
        _day(25).isoformat(): (0, 15.5),
        _day(20).isoformat(): (10, 0),
        _day(5).isoformat(): (0, 5.25),
        TODAY.isoformat(): (2, 0),
    }


def test_analytics_match_the_script(api_client, month):
    i = month.dealer.ids
    result = _report(api_client, month, "analytics")
    # three active products: the faster half (rounded up) is fast, the rest slow, never one product in both lists
    assert [(m["product_id"], m["out_quantity"]) for m in result["fast_movers"]] == [(i["p1"], 27.5), (i["p2"], 10)]
    assert [(m["product_id"], m["out_quantity"]) for m in result["slow_movers"]] == [(i["p3"], 5.25)]
    assert [(b["product_id"], b["quantity"]) for b in result["best_sellers"]] == [
        (i["p1"], 22.5),
        (i["p3"], 5.25),
        (i["p2"], 5),
    ]
    trend = {p["date"]: (p["in"], p["out"]) for p in result["trend"]}
    assert len(trend) == 30
    assert trend[_day(28).isoformat()] == (90, 0)
    assert trend[_day(10).isoformat()] == (0, 0)  # the transfer day: a transfer is neither
    assert round(sum(v[0] for v in trend.values()), 2) == 101.25
    assert round(sum(v[1] for v in trend.values()), 2) == 42.75


# --- the exports open and match the reports ---------------------------------------------------------------------------


def _cell(value: object) -> str:
    """What the report value must read as in the file (an independent statement of the CSV rules)."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        visible = [c for c in value if unicodedata.category(c) not in INVISIBLE]
        formula = bool(visible) and unicodedata.normalize("NFKC", visible[0]) in FORMULA
        return "'" + value if formula else value
    return str(value)


def _table(report: str, data: dict) -> list[dict]:
    sections = {
        "sales-split": ("by_day", "by_product"),
        "analytics": ("trend", "fast_movers", "slow_movers", "best_sellers"),
    }
    if report in sections:
        return [{"section": s, **row} for s in sections[report] for row in data[s]]
    return data["rows"]


def _export(api_client, m: Month, report: str, token: str | None = None) -> httpx.Response:
    """An export as the month's dealer (or `token`). The dealer signs in again before their session reaches the export
    limit, as a dealer would after a minute; the limit itself is proven in test_exports_have_their_own_limit."""
    if token is None:
        if not m.export_token or m.exports_made >= EXPORTS_PER_SESSION:
            m.export_token, m.exports_made = sign_in(m.dealer.email), 0
        m.exports_made += 1
        token = m.export_token
    return api_client(
        "POST", f"{INV}/exports", token, json={"report": report, "from": START.isoformat(), "to": TODAY.isoformat()}
    )


def _token_claims(url: str) -> dict:
    token = httpx.URL(url).params["token"]
    payload = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))


def _path_of(url: str) -> str:
    """The object path inside the bucket, from a signed link."""
    return httpx.URL(url).path.split(f"/object/sign/{BUCKET}/", 1)[1]


@pytest.mark.parametrize("report", REPORTS)
def test_each_export_opens_by_its_link_and_matches_the_report(api_client, month, report):
    result = ok(_export(api_client, month, report), 201)
    claims = _token_claims(result["url"])
    # the link lives ten minutes (exports.SIGNED_URL_SECONDS), and the answer says when it ends
    assert claims["exp"] - claims["iat"] == 600
    assert abs(datetime.fromisoformat(result["expires_at"]).timestamp() - claims["exp"]) <= 5
    path = _path_of(result["url"])
    assert path.startswith(f"{month.dealer.id}/{report}-")
    assert path.endswith(".csv")
    month.exports[report] = {"url": result["url"], "path": path}

    # plain HTTP, no token or key: the link alone opens the file
    fetched = httpx.get(result["url"], timeout=30)
    assert fetched.status_code == 200, fetched.text
    assert fetched.headers["content-type"].startswith("text/csv")
    assert fetched.content.startswith(b"\xef\xbb\xbf")
    lines = list(csv.reader(io.StringIO(fetched.content.decode("utf-8-sig"), newline="")))

    data = _report(api_client, month, report)
    header, body = lines[0], lines[1:]
    rows = _table(report, data)
    assert len(body) == len(rows), (report, len(body), len(rows))
    for line, row in zip(body, rows, strict=True):
        record = dict(zip(header, line, strict=True))
        for column, cell in record.items():
            if column not in row:
                assert cell == "", (report, column, cell)
                continue
            value = row[column]
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                assert float(cell) == value, (report, column, cell, value)
            else:
                assert cell == _cell(value), (report, column, cell, value)
    if report == "reconciliation":
        # one number style: every figure a decimal (0.0 beside -7.0), as in the other files
        figures = [cell for line in body for cell in line[3:-1]]
        assert figures, body
        assert all("." in cell for cell in figures), figures
    if report == "stock-summary":
        # the names came back exactly: comma, quotes, newline, Urdu, and the formula ones neutralised
        names = {r["name"] for r in (dict(zip(header, line, strict=True)) for line in body)}
        assert names == {month.names["p1"], month.names["p2"], "'" + month.names["p3"]}


def test_an_old_link_stops_opening_once_expired(api_client, month):
    """A link is good for its lifetime only. Ten minutes is too long to wait in a test, so the dealer's own export is
    signed again for one second, as the API signs it but shorter, and followed after it ran out."""
    path = ok(_export(api_client, month, "valuation"), 201)["url"]
    path = _path_of(path)
    signed = httpx.post(
        f"{STORAGE}/object/sign/{BUCKET}/{path}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
        json={"expiresIn": 1},
        timeout=30,
    )
    assert signed.status_code == 200, signed.text
    url = STORAGE + signed.json()["signedURL"].removeprefix("/storage/v1")
    time.sleep(3)
    expired = httpx.get(url, timeout=30)
    assert expired.status_code in (400, 401, 403), expired.text
    assert "product_id" not in expired.text


def test_a_link_pointed_at_another_file_does_not_open_it(api_client, month):
    first = ok(_export(api_client, month, "stock-summary"), 201)["url"]
    second = _path_of(ok(_export(api_client, month, "valuation"), 201)["url"])
    guessed = first.replace(_path_of(first), second)
    assert guessed != first
    refused = httpx.get(guessed, timeout=30)
    assert refused.status_code in (400, 401, 403), refused.text
    assert "product_id" not in refused.text


# --- two-user proofs --------------------------------------------------------------------------------------------------


def _storage_headers(token: str) -> dict[str, str]:
    return {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}


def _own_file(api_client, m: Month) -> str:
    """One export file of the month's dealer, made once, for the refusal tests to aim at."""
    if not m.own_file:
        m.own_file = _path_of(ok(_export(api_client, m, "stock-summary"), 201)["url"])
    return m.own_file


def test_the_owner_reads_their_own_export_through_storage(api_client, month):
    """The control for the refusals below: the bucket's read policy admits the owning, approved dealer."""
    path = _own_file(api_client, month)
    read = httpx.get(
        f"{STORAGE}/object/authenticated/{BUCKET}/{path}", headers=_storage_headers(month.dealer.token), timeout=30
    )
    assert read.status_code == 200, read.text
    listed = httpx.post(
        f"{STORAGE}/object/list/{BUCKET}",
        headers=_storage_headers(month.dealer.token),
        json={"prefix": month.dealer.id},
        timeout=30,
    )
    assert path.split("/")[1] in {f["name"] for f in listed.json()}


def test_another_dealer_reaches_none_of_the_reports_or_exports(world, backend_url, api_client, month):
    other = approved_dealer(backend_url, world.admin.token)
    _EXPORT_FOLDERS.add(other.id)
    mine = set(month.dealer.ids.values())
    # Their reports are their own (empty) business: none of A's products, locations or suppliers appear.
    for report in REPORTS:
        body = json.dumps(_report(api_client, month, report, token=other.token))
        assert not any(i in body for i in mine), report
        assert month.names["supplier"] not in body
    # Their export is of their own data, whatever the body says.
    result = ok(
        api_client(
            "POST",
            f"{INV}/exports",
            other.token,
            json={"report": "stock-summary", "dealer_id": month.dealer.id, "path": f"{month.dealer.id}/x.csv"},
        ),
        201,
    )
    assert _path_of(result["url"]).startswith(f"{other.id}/")
    content = httpx.get(result["url"], timeout=30).text
    assert not any(i in content for i in mine)

    # Straight through Storage with their own token: A's file is neither readable, listable nor signable.
    path = _own_file(api_client, month)
    headers = _storage_headers(other.token)
    read = httpx.get(f"{STORAGE}/object/authenticated/{BUCKET}/{path}", headers=headers, timeout=30)
    assert read.status_code in (400, 403, 404), read.text
    assert "product_id" not in read.text
    listed = httpx.post(
        f"{STORAGE}/object/list/{BUCKET}", headers=headers, json={"prefix": month.dealer.id}, timeout=30
    )
    assert listed.status_code != 200 or listed.json() == [], listed.text
    signed = httpx.post(f"{STORAGE}/object/sign/{BUCKET}/{path}", headers=headers, json={"expiresIn": 60}, timeout=30)
    assert signed.status_code in (400, 403, 404), signed.text
    # Nor can they put a file in A's folder (the bucket has no write policy for anyone).
    planted = httpx.post(
        f"{STORAGE}/object/{BUCKET}/{month.dealer.id}/planted.csv",
        headers={**headers, "content-type": "text/csv"},
        content=b"product_id\nfake\n",
        timeout=30,
    )
    assert planted.status_code in (400, 403), planted.text
    # And the public route does not serve a private bucket.
    public = httpx.get(f"{STORAGE}/object/public/{BUCKET}/{path}", timeout=30)
    assert public.status_code in (400, 404), public.text


@pytest.mark.parametrize("role", ["dealer_pending", "farmer", "buyer", "expert", "admin"])
def test_every_other_actor_is_refused_every_report_and_export(world, api_client, month, make_actor, role):
    if role == "dealer_pending":
        actor_id, _, token = make_actor("dealer")
    else:
        actor = getattr(world, role)
        actor_id, token = actor.id, actor.token
    for report in REPORTS:
        response = api_client("GET", f"{INV}/reports/{report}", token)
        assert response.status_code == 403, (role, report, response.text)
        exported = api_client("POST", f"{INV}/exports", token, json={"report": report})
        assert exported.status_code == 403, (role, report, exported.text)
    # nothing was written for them
    assert (
        sql(f"select count(*) from storage.objects where bucket_id = '{BUCKET}' and name like '{_uuid(actor_id)}/%'")
        == "0"
    )
    # and Storage refuses them the dealer's file too
    path = _own_file(api_client, month)
    read = httpx.get(f"{STORAGE}/object/authenticated/{BUCKET}/{path}", headers=_storage_headers(token), timeout=30)
    assert read.status_code in (400, 403, 404), (role, read.text)


def test_a_pending_dealer_cannot_read_even_their_own_folder(make_actor):
    """is_approved_dealer() in the bucket policy: a file planted in a pending dealer's folder (by the service role, as
    only the API can write) is not theirs to read until they are approved."""
    actor_id, _, token = make_actor("dealer")
    path = f"{actor_id}/planted-{uuid.uuid4().hex[:6]}.csv"
    put = httpx.post(
        f"{STORAGE}/object/{BUCKET}/{path}",
        headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "content-type": "text/csv"},
        content=b"product_id\nx\n",
        timeout=30,
    )
    assert put.status_code == 200, put.text
    try:
        read = httpx.get(f"{STORAGE}/object/authenticated/{BUCKET}/{path}", headers=_storage_headers(token), timeout=30)
        assert read.status_code in (400, 403, 404), read.text
    finally:
        httpx.request(
            "DELETE",
            f"{STORAGE}/object/{BUCKET}",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            json={"prefixes": [path]},
            timeout=30,
        )


def test_reports_and_exports_need_a_token(api_client):
    for report in REPORTS:
        assert api_client("GET", f"{INV}/reports/{report}").status_code == 401
    assert api_client("POST", f"{INV}/exports", json={"report": "valuation"}).status_code == 401


def test_exports_have_their_own_limit(api_client, month):
    """B5 verification F4: one session makes at most ten exports a minute (exports.EXPORTS_PER_MINUTE), well under the
    200/minute default; the eleventh is refused before anything is written."""
    token = sign_in(month.dealer.email)
    before = int(
        sql(f"select count(*) from storage.objects where bucket_id = '{BUCKET}' and name like '{month.dealer.id}/%'")
    )
    statuses = [_export(api_client, month, "movements-by-source", token).status_code for _ in range(11)]
    assert statuses == [201] * 10 + [429]
    limited = _export(api_client, month, "movements-by-source", token)
    assert limited.json()["code"] == "rate_limited"
    after = int(
        sql(f"select count(*) from storage.objects where bucket_id = '{BUCKET}' and name like '{month.dealer.id}/%'")
    )
    assert after - before == 10


def test_the_reconciliation_covers_every_product_past_the_row_cap(world, backend_url, api_client):
    """B5 verification F1: PostgREST returns at most 1000 rows a call, and the reconciliation was one call. A dealer
    with 1201 products, the 300 last in product_id order unbalanced (stock set outside the stock functions, as the
    database owner), sees all 1201 and all 300, the unbalanced first, in the report and in its file."""
    d = approved_dealer(backend_url, world.admin.token)
    _EXPORT_FOLDERS.add(d.id)
    shop = ok(api_client("POST", f"{INV}/locations", d.token, json={"name": "Bulk shop"}), 201)
    did, sid = _uuid(d.id), _uuid(shop["id"])
    sql(
        "insert into public.inventory_products (dealer_id, sku, name) "
        f"select '{did}', 'BULK-' || g, 'Bulk ' || lpad(g::text, 4, '0') from generate_series(1, 1201) g"
    )
    sql(
        "insert into public.inventory_stock (product_id, location_id, dealer_id, quantity) "
        f"select id, '{sid}', '{did}', 1 from public.inventory_products where dealer_id = '{did}' "
        "order by id offset 901"
    )
    past_the_cap = sql(
        f"select id from public.inventory_products where dealer_id = '{did}' order by id offset 1200 limit 1"
    )

    recon = ok(api_client("GET", f"{INV}/reports/reconciliation", d.token))
    assert len(recon["rows"]) == 1201
    assert recon["unbalanced"] == 300
    assert all(not r["balanced"] for r in recon["rows"][:300])
    assert all(r["balanced"] for r in recon["rows"][300:])
    assert past_the_cap in {r["product_id"] for r in recon["rows"][:300]}

    result = ok(api_client("POST", f"{INV}/exports", d.token, json={"report": "reconciliation"}), 201)
    lines = list(csv.reader(io.StringIO(httpx.get(result["url"], timeout=30).content.decode("utf-8-sig"), newline="")))
    assert len(lines) == 1 + 1201
    assert sum(1 for line in lines[1:] if line[-1] == "false") == 300
