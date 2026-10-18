"""reports.py (B5; SRDS §17, §18, §25): the period, the figures each report computes from the ledger, and the routes.

The repository is the faked edge here (its own page walk is tested at the PostgREST edge below and in
test_inventory_repository.py); the same reports run against the real database on a scripted month in
tests/integration/smoke/test_smoke_inventory_reports.py.
"""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.errors import AppHTTPException
from app.inventory import reports
from app.inventory import repository as repo
from app.main import app

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"
BASE = "/api/v1/inventory/reports"
ROUTES = [
    "stock-summary",
    "valuation",
    "movements-by-source",
    "low-out-of-stock",
    "supplier-purchases",
    "sales-split",
    "analytics",
]
TODAY = datetime.now(UTC).date()


def _product(pid: str, name: str, stock: list[tuple[str, float]], cost: float | None = None, **extra) -> dict:
    return {
        "id": pid,
        "sku": pid.upper(),
        "name": name,
        "unit": "bag",
        "cost_price": cost,
        "reorder_threshold": extra.pop("threshold", 0),
        "is_active": extra.pop("is_active", True),
        "stock": [{"location_id": loc, "quantity": qty} for loc, qty in stock],
        **extra,
    }


def _move(pid: str, direction: str, source: str, quantity: float | str, day: date = TODAY, loc: str = "shop") -> dict:
    return {
        "product_id": pid,
        "location_id": loc,
        "direction": direction,
        "source": source,
        "quantity": quantity,
        "created_at": datetime(day.year, day.month, day.day, 9, 30, tzinfo=UTC).isoformat(),
    }


def _world(products: list[dict], movements: list[dict] | None = None, **more):
    """Patches every repository read a report makes; returns the patches so a test can see what was asked."""
    patches = {
        "fetch_all_products": AsyncMock(return_value=products),
        "fetch_default_location": AsyncMock(return_value={"id": "shop"}),
        "fetch_all_names": AsyncMock(side_effect=lambda _t, table: more.get(table, [])),
        "fetch_all_movements": AsyncMock(return_value=movements or []),
        "fetch_received_purchases": AsyncMock(return_value=more.get("purchases", [])),
        "fetch_reconciliation": AsyncMock(return_value=more.get("reconciliation", [])),
    }
    return patches


class _patched:
    def __init__(self, mocks: dict) -> None:
        self.mocks = mocks
        self.stack = [patch(f"{REPO}.{name}", mock) for name, mock in mocks.items()]

    def __enter__(self) -> dict:
        for p in self.stack:
            p.start()
        return self.mocks

    def __exit__(self, *_exc) -> None:
        for p in self.stack:
            p.stop()


# --- the period -------------------------------------------------------------------------------------------------------


def test_the_default_period_is_the_last_thirty_days_ending_today():
    assert reports.report_period(None, None) == (TODAY - timedelta(days=29), TODAY)


def test_a_period_given_only_its_end_reaches_back_thirty_days():
    assert reports.report_period(None, date(2026, 3, 31)) == (date(2026, 3, 2), date(2026, 3, 31))


def test_a_single_day_is_a_period():
    assert reports.report_period(date(2026, 5, 1), date(2026, 5, 1)) == (date(2026, 5, 1), date(2026, 5, 1))


def test_a_start_after_the_end_is_refused():
    with pytest.raises(AppHTTPException) as caught:
        reports.report_period(date(2026, 5, 2), date(2026, 5, 1))
    assert (caught.value.status_code, caught.value.code) == (422, "validation_failed")


def test_a_leap_year_fits_and_a_day_more_is_refused():
    # 366 days is the most: a whole leap year, from 1 January to 31 December.
    assert reports.report_period(date(2028, 1, 1), date(2028, 12, 31))
    with pytest.raises(AppHTTPException) as caught:
        reports.report_period(date(2027, 12, 31), date(2028, 12, 31))
    assert caught.value.status_code == 422
    assert "366" in caught.value.detail


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.parametrize("route", ROUTES)
@pytest.mark.parametrize(
    "query",
    [
        # dates only: a timestamp, even one at midnight, is not a day
        "from=2026-10-01T00:00:00&to=2026-10-02",
        "from=2026-10-01T00:00:00Z&to=2026-10-02",
        "from=1790812800&to=2026-10-02",
        "from=2026-10-01&to=1790899200",
        "from=20261001",
        "from=2026-02-30",
        "from=yesterday",
        # from after to, and a span past the maximum
        "from=2026-10-02&to=2026-10-01",
        "from=2025-01-01&to=2026-10-01",
        # the last representable day: `to` + 1 day is the bound of the read and must not overflow into a 500
        "from=9999-12-31&to=9999-12-31",
    ],
)
def test_every_report_route_refuses_a_bad_period(client, route, query):
    with _patched(_world([])) as mocks:
        response = client.get(f"{BASE}/{route}?{query}")
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_failed"
    # a refused period reads nothing
    mocks["fetch_all_movements"].assert_not_called()
    mocks["fetch_received_purchases"].assert_not_called()


@pytest.mark.parametrize("route", ROUTES)
def test_every_report_route_answers_its_period(client, route):
    with _patched(_world([_product("p1", "Urea", [("shop", 3)])])) as mocks:
        response = client.get(f"{BASE}/{route}?from=2026-09-01&to=2026-09-30")
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["from"], body["to"]) == ("2026-09-01", "2026-09-30")
    # whole UTC days: `to` is read up to the start of the next day
    reads = mocks["fetch_all_movements"].await_args_list or mocks["fetch_received_purchases"].await_args_list
    assert reads, "every report but reconciliation reads its period"
    since, before = reads[0].args[1], reads[0].args[2]
    assert since == "2026-09-01T00:00:00+00:00"
    assert before == "2026-10-01T00:00:00+00:00"


def test_the_reconciliation_route_takes_no_period_and_covers_the_whole_ledger(client):
    with _patched(_world([], reconciliation=[])) as mocks:
        response = client.get(f"{BASE}/reconciliation?from=2026-09-01&to=2026-09-30")
    assert response.status_code == 200, response.text
    assert set(response.json()) == {"generated_at", "unbalanced", "rows"}
    mocks["fetch_all_movements"].assert_not_called()


@pytest.mark.parametrize("route", [*ROUTES, "reconciliation"])
def test_the_report_routes_return_whole_reports_not_pages(client, route):
    """A report's figures are totals over every row, so a route has no limit or offset: a page of a report would be a
    wrong report, not a short one. The rows behind it are read in pages (the _every_page tests below)."""
    with _patched(_world([_product(f"p{i}", f"P{i:04}", [("shop", 1)]) for i in range(1500)])):
        response = client.get(f"{BASE}/{route}?limit=5&offset=10")
    assert response.status_code == 200, response.text
    assert "link" not in response.headers
    body = response.json()
    if route in ("stock-summary", "valuation", "reconciliation"):
        expected = 0 if route == "reconciliation" else 1500
        assert len(body["rows"]) == expected


# --- the figures ------------------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_figures_are_two_decimal_numbers_without_float_noise():
    """Quantities hold at most two decimals (B1), so every sum of them does too; Python's float sums must not leak
    0.30000000000000004 into a report or its CSV."""
    products = [_product("p1", "Urea", [("shop", 0.1), ("godown", 0.2)], cost=0.1, threshold=1)]
    movements = [
        _move("p1", "in", "RESTOCK", 0.1),
        _move("p1", "in", "RESTOCK", "0.2"),
        _move("p1", "out", "LOCAL_SALE", 0.1),
        _move("p1", "out", "LOCAL_SALE", 0.2),
        _move("p1", "out", "ZARAILINK_ORDER", 0.7),
        _move("p1", "out", "ZARAILINK_ORDER", 0.1),
    ]
    purchases = [
        {"supplier_id": "s1", "items": [{"quantity": 0.1, "unit_cost": 0.1}, {"quantity": 0.2, "unit_cost": 3}]}
    ]
    names = {
        "inventory_suppliers": [{"id": "s1", "name": "S"}],
        "inventory_locations": [{"id": "shop", "name": "Shop"}, {"id": "godown", "name": "Godown"}],
    }
    with _patched(_world(products, movements, purchases=purchases, **names)):
        summary = await reports.stock_summary(DEALER, TODAY, TODAY)
        value = await reports.valuation(DEALER, TODAY, TODAY)
        sources = await reports.movements_by_source(DEALER, TODAY, TODAY)
        low = await reports.low_out_of_stock(DEALER, TODAY, TODAY)
        bought = await reports.supplier_purchases(DEALER, TODAY, TODAY)
        split = await reports.sales_split(DEALER, TODAY, TODAY)
        trend = await reports.analytics(DEALER, TODAY, TODAY)
    assert summary["total_quantity"] == 0.3
    assert summary["rows"][1]["period_in"] == 0.3  # shop sorts after godown
    assert value["rows"][0]["quantity"] == 0.3
    assert value["rows"][0]["value"] == 0.03
    assert value["rows"][0]["period_in"] == 0.3
    assert value["rows"][0]["period_out"] == 1.1
    restock = next(r for r in sources["rows"] if r["source"] == "RESTOCK")
    sale = next(r for r in sources["rows"] if r["source"] == "LOCAL_SALE")
    assert (restock["in"], restock["net"], sale["out"], sale["net"]) == (0.3, 0.3, 0.3, -0.3)
    assert (low["rows"][0]["quantity"], low["rows"][0]["period_out"]) == (0.1, 1.1)
    assert bought["rows"][0]["quantity"] == 0.3
    assert bought["rows"][0]["cost"] == 0.61
    assert bought["total_quantity"] == 0.3
    assert split["local_total"] == 0.3
    assert split["marketplace_total"] == 0.8
    assert split["by_product"][0]["total"] == 1.1
    assert split["by_day"][0] == {"date": TODAY.isoformat(), "marketplace": 0.8, "local": 0.3}
    assert trend["trend"][0] == {"date": TODAY.isoformat(), "in": 0.3, "out": 1.1}
    assert trend["best_sellers"][0]["quantity"] == 1.1


@pytest.mark.asyncio
async def test_a_low_stock_row_counts_the_period_pace():
    products = [_product("p1", "Urea", [("shop", 0.3)], threshold=1), _product("p2", "DAP", [("shop", 0)])]
    movements = [_move("p1", "out", "LOCAL_SALE", 0.1), _move("p1", "out", "LOCAL_SALE", 0.2)]
    with _patched(_world(products, movements)):
        low = await reports.low_out_of_stock(DEALER, TODAY - timedelta(days=2), TODAY)
    assert [r["product_id"] for r in low["rows"]] == ["p2", "p1"]  # out of stock first
    assert (low["low_stock"], low["out_of_stock"]) == (1, 1)
    p1 = low["rows"][1]
    assert (p1["period_out"], p1["daily_out"], p1["days_of_cover"]) == (0.3, 0.1, 3.0)
    # Out of stock has no cover to count: null (a blank cell), not "0 days", which reads as a figure.
    assert low["rows"][0]["days_of_cover"] is None


@pytest.mark.asyncio
async def test_stock_summary_is_per_location_with_transfers_counted():
    products = [_product("p1", "Urea", [("shop", 6), ("godown", 4)])]
    movements = [
        _move("p1", "in", "RESTOCK", 10),
        _move("p1", "out", "TRANSFER", 4),
        _move("p1", "in", "TRANSFER", 4, loc="godown"),
    ]
    names = [{"id": "shop", "name": "Shop"}, {"id": "godown", "name": "Godown"}]
    with _patched(_world(products, movements, inventory_locations=names)):
        summary = await reports.stock_summary(DEALER, TODAY, TODAY)
    assert [(r["location_name"], r["quantity"], r["period_in"], r["period_out"]) for r in summary["rows"]] == [
        ("Godown", 4, 4, 0),
        ("Shop", 6, 10, 4),
    ]
    assert summary["total_quantity"] == 10


@pytest.mark.asyncio
async def test_valuation_leaves_transfers_out_and_an_unknown_cost_unknown():
    products = [
        _product("p1", "Urea", [("shop", 6), ("godown", 4)], cost=3500.5),
        _product("p2", "Seed", [("shop", 2)]),
        _product("p3", "Old", [], cost=10, is_active=False),
        _product("p4", "Old stocked", [("shop", 1)], cost=10, is_active=False),
    ]
    movements = [_move("p1", "out", "TRANSFER", 4), _move("p1", "in", "TRANSFER", 4, loc="godown")]
    with _patched(_world(products, movements)):
        value = await reports.valuation(DEALER, TODAY, TODAY)
    rows = {r["product_id"]: r for r in value["rows"]}
    assert set(rows) == {"p1", "p2", "p4"}  # an inactive product without stock has no value to list
    assert rows["p1"]["value"] == 35005.0
    assert (rows["p1"]["period_in"], rows["p1"]["period_out"]) == (0, 0)
    assert rows["p2"]["value"] is None
    assert value["total_value"] == 35015.0
    assert value["products_without_cost"] == 1


@pytest.mark.asyncio
async def test_movements_by_source_lists_every_source_in_srds_order():
    movements = [_move("p1", "in", "RESTOCK", 5), _move("p1", "in", "RESTOCK", 1), _move("p1", "out", "DAMAGE", 2)]
    with _patched(_world([], movements)):
        sources = await reports.movements_by_source(DEALER, TODAY, TODAY)
    assert [r["source"] for r in sources["rows"]] == [
        "ZARAILINK_ORDER",
        "LOCAL_SALE",
        "PURCHASE",
        "RESTOCK",
        "MANUAL_ADJUSTMENT",
        "DAMAGE",
        "EXPIRY",
        "TRANSFER",
        "OTHER",
    ]
    rows = {r["source"]: r for r in sources["rows"]}
    assert (rows["RESTOCK"]["in"], rows["RESTOCK"]["movements"]) == (6, 2)
    assert (rows["DAMAGE"]["net"], rows["OTHER"]["movements"]) == (-2, 0)


@pytest.mark.asyncio
async def test_supplier_purchases_group_by_supplier_and_name_the_missing_ones():
    purchases = [
        {"supplier_id": "s1", "items": [{"quantity": 2, "unit_cost": 100}, {"quantity": 1, "unit_cost": None}]},
        {"supplier_id": "s1", "items": [{"quantity": 3, "unit_cost": 50}]},
        {"supplier_id": None, "items": [{"quantity": 1, "unit_cost": 999}]},
        {"supplier_id": "gone", "items": []},
    ]
    with _patched(_world([], purchases=purchases, inventory_suppliers=[{"id": "s1", "name": "Depot"}])):
        bought = await reports.supplier_purchases(DEALER, TODAY, TODAY)
    assert [
        (r["supplier_name"], r["purchases"], r["quantity"], r["cost"], r["lines_without_cost"]) for r in bought["rows"]
    ] == [
        ("No supplier", 1, 1, 999, 0),
        ("Depot", 2, 6, 350, 1),
        ("", 1, 0, 0, 0),
    ]
    assert (bought["total_purchases"], bought["total_quantity"], bought["total_cost"]) == (4, 7, 1349)


@pytest.mark.asyncio
async def test_sales_split_nets_returned_units_and_keeps_every_day():
    start = TODAY - timedelta(days=2)
    movements = [
        _move("p1", "out", "ZARAILINK_ORDER", 5, start),
        _move("p1", "in", "ZARAILINK_ORDER", 1, start),
        _move("p1", "out", "LOCAL_SALE", 2, TODAY),
        _move("p1", "out", "DAMAGE", 9, TODAY),
    ]
    with _patched(_world([_product("p1", "Urea", [])], movements)):
        split = await reports.sales_split(DEALER, start, TODAY)
    assert [d["date"] for d in split["by_day"]] == [(start + timedelta(days=i)).isoformat() for i in range(3)]
    assert split["by_day"][0] == {"date": start.isoformat(), "marketplace": 4, "local": 0}
    assert split["by_day"][1] == {"date": (start + timedelta(days=1)).isoformat(), "marketplace": 0, "local": 0}
    assert split["by_product"] == [
        {"product_id": "p1", "sku": "P1", "name": "Urea", "marketplace": 4, "local": 2, "total": 6}
    ]


@pytest.mark.asyncio
async def test_analytics_movers_and_best_sellers():
    products = [
        _product("a", "A", [("shop", 1)]),
        _product("b", "B", [("shop", 1)]),
        _product("c", "C", [("shop", 1)]),
        _product("z", "Z", [("shop", 1)], is_active=False),
    ]
    movements = [
        _move("a", "out", "LOCAL_SALE", 9),
        _move("b", "out", "DAMAGE", 4),
        _move("b", "out", "TRANSFER", 50),
        _move("z", "out", "LOCAL_SALE", 99),
    ]
    with _patched(_world(products, movements)):
        result = await reports.analytics(DEALER, TODAY - timedelta(days=1), TODAY)
    # Three active products (the inactive one is left out): the faster half, rounded up, is the fast list; transfers are
    # no outflow, and c sold nothing, so it can only be slow.
    assert [m["product_id"] for m in result["fast_movers"]] == ["a", "b"]
    assert result["fast_movers"][0]["daily_out"] == 4.5
    assert [m["product_id"] for m in result["slow_movers"]] == ["c"]
    assert [b["product_id"] for b in result["best_sellers"]] == ["z", "a"]  # damage is no sale
    assert len(result["trend"]) == 2


@pytest.mark.asyncio
async def test_reconciliation_names_each_product_and_puts_the_unbalanced_first():
    recon = [
        {"product_id": "p1", "ledger_total": 5, "current_stock": 5, "balanced": True},
        {"product_id": "p2", "ledger_total": 3, "current_stock": 4, "balanced": False},
    ]
    with _patched(_world([_product("p1", "Urea", []), _product("p2", "DAP", [])], reconciliation=recon)):
        result = await reports.reconciliation(DEALER)
    assert result["unbalanced"] == 1
    assert [(r["product_id"], r["name"], r["sku"]) for r in result["rows"]] == [
        ("p2", "DAP", "P2"),
        ("p1", "Urea", "P1"),
    ]


# --- every page of the rows behind a report ---------------------------------------------------------------------------


class _Query:
    def __init__(self, pages: list[list[dict]], steps: list) -> None:
        self.pages, self.steps = pages, steps

    def __getattr__(self, name: str):
        def step(*args, **_kwargs):
            self.steps.append((name, args))
            return self

        return step

    async def execute(self):
        return SimpleNamespace(data=self.pages.pop(0) if self.pages else [], count=None)


class _Client:
    def __init__(self, pages: list[list[dict]]) -> None:
        self.pages, self.steps = pages, []

    def table(self, name: str) -> _Query:
        self.steps.append(("table", (name,)))
        return _Query(self.pages, self.steps)

    def rpc(self, name: str, params: dict) -> _Query:
        self.steps.append(("rpc", (name, params)))
        return _Query(self.pages, self.steps)


def _rows(n: int, start: int = 0) -> list[dict]:
    return [{"id": f"r{i}"} for i in range(start, start + n)]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("read", "args", "table"),
    [
        (
            repo.fetch_all_movements,
            ("tok", "2026-09-01T00:00:00+00:00", "2026-10-01T00:00:00+00:00"),
            "inventory_movements",
        ),
        (repo.fetch_all_products, ("tok",), "inventory_products"),
        (repo.fetch_all_names, ("tok", "inventory_locations"), "inventory_locations"),
        (repo.fetch_all_names, ("tok", "inventory_suppliers"), "inventory_suppliers"),
        (
            repo.fetch_received_purchases,
            ("tok", "2026-09-01T00:00:00+00:00", "2026-10-01T00:00:00+00:00"),
            "inventory_purchases",
        ),
    ],
)
async def test_every_report_read_walks_past_the_1000_row_cap(read, args, table):
    client = _Client([_rows(1000), _rows(1000, 1000), _rows(1, 2000)])
    with patch(f"{REPO}.get_user_scoped_client", AsyncMock(return_value=client)):
        rows = await read(*args)
    assert len(rows) == 2001
    assert len({r["id"] for r in rows}) == 2001
    assert [a for name, a in client.steps if name == "range"] == [(0, 999), (1000, 1999), (2000, 2999)]
    assert ("table", (table,)) in client.steps
    # the order is total (it ends in `id`), so no row falls between two pages
    orders = [a for name, a in client.steps if name == "order"]
    assert orders[-1] == ("id",)


@pytest.mark.asyncio
async def test_a_read_of_exactly_one_full_page_asks_once_more_and_stops():
    client = _Client([_rows(1000), []])
    with patch(f"{REPO}.get_user_scoped_client", AsyncMock(return_value=client)):
        rows = await repo.fetch_all_movements("tok")
    assert len(rows) == 1000
    assert [a for name, a in client.steps if name == "range"] == [(0, 999), (1000, 1999)]


@pytest.mark.asyncio
async def test_a_period_read_is_bounded_on_both_sides():
    client = _Client([[]])
    with patch(f"{REPO}.get_user_scoped_client", AsyncMock(return_value=client)):
        await repo.fetch_all_movements("tok", "S", "B", "product_id")
    assert ("gte", ("created_at", "S")) in client.steps
    assert ("lt", ("created_at", "B")) in client.steps


@pytest.mark.asyncio
async def test_names_are_read_only_for_locations_and_suppliers():
    with pytest.raises(ValueError, match="has no report labels"):
        await repo.fetch_all_names("tok", "profiles")


# --- errors -----------------------------------------------------------------------------------------------------------


def test_a_database_error_behind_a_report_is_the_global_problem_answer_without_detail(client):
    failing = _world([])
    failing["fetch_all_movements"] = AsyncMock(
        side_effect=APIError({"code": "57014", "message": "canceling statement due to statement timeout"})
    )
    with _patched(failing):
        response = client.get(f"{BASE}/movements-by-source")
    assert response.status_code >= 500
    assert "statement timeout" not in response.text


@pytest.mark.parametrize("route", [*ROUTES, "reconciliation"])
def test_every_report_route_refuses_another_role(route):
    for role in ("farmer", "buyer", "expert", "admin"):
        app.dependency_overrides[get_current_user] = lambda role=role: AuthenticatedUser(
            id="u", email="u@x.com", role=role, access_token="tok"
        )
        try:
            with _patched(_world([])) as mocks:
                response = TestClient(app).get(f"{BASE}/{route}")
        finally:
            app.dependency_overrides.pop(get_current_user, None)
        assert response.status_code == 403, (role, response.text)
        assert response.json()["code"] == "insufficient_role"
        mocks["fetch_all_products"].assert_not_called()


@pytest.mark.parametrize("route", [*ROUTES, "reconciliation"])
def test_every_report_route_needs_a_token(route):
    response = TestClient(app).get(f"{BASE}/{route}")
    assert response.status_code == 401


@pytest.mark.parametrize("query", ["to=9999-12-31", "from=2026-10-01T00:00:00", "from=1790812800", "to=1999-12-31"])
def test_the_ledger_filter_takes_the_same_days(client, query):
    """The movement ledger's `from`/`to` share the reports' day type (`to=9999-12-31` overflowed into a 500 there)."""
    with patch(f"{REPO}.fetch_movements", AsyncMock(return_value=[])) as fetch:
        response = client.get(f"/api/v1/inventory/movements?{query}")
    assert response.status_code == 422, response.text
    fetch.assert_not_called()


def _movers(outs: dict[str, float]) -> tuple[list[str], list[str]]:
    import asyncio

    products = [_product(pid, pid.upper(), [("shop", 1)]) for pid in outs]
    movements = [_move(pid, "out", "LOCAL_SALE", qty) for pid, qty in outs.items() if qty]
    with _patched(_world(products, movements)):
        result = asyncio.run(reports.analytics(DEALER, TODAY, TODAY))
    return [m["product_id"] for m in result["fast_movers"]], [m["product_id"] for m in result["slow_movers"]]


@pytest.mark.parametrize(
    ("outs", "fast", "slow"),
    [
        # two sellers: one each, never the same product in both lists (the device walk found exactly that)
        ({"a": 5, "b": 1}, ["a"], ["b"]),
        ({"a": 5}, ["a"], []),
        ({"a": 0}, [], ["a"]),
        ({"a": 0, "b": 0}, [], ["a", "b"]),
        ({"a": 3, "b": 2, "c": 1}, ["a", "b"], ["c"]),
        # at most five a list; the slowest first
        ({f"p{i}": i for i in range(1, 13)}, ["p12", "p11", "p10", "p9", "p8"], ["p1", "p2", "p3", "p4", "p5"]),
    ],
)
def test_fast_and_slow_movers_never_share_a_product(outs, fast, slow):
    got_fast, got_slow = _movers(outs)
    assert (got_fast, got_slow) == (fast, slow)
    assert not set(got_fast) & set(got_slow)


@pytest.mark.asyncio
async def test_reconciliation_figures_are_two_decimal_floats():
    """PostgREST sends numeric as 0 or -3.0 alike; the report (and so its CSV) writes every figure the same way."""
    recon = [
        {
            "product_id": "p1",
            "marketplace_sales": -3.0,
            "local_sales": 0,
            "adjustments": 1.1,
            "restocks_and_purchases": 5,
            "losses": 0,
            "transfers": 0,
            "other": 0,
            "ledger_total": 3.1,
            "current_stock": 3.1,
            "balanced": True,
        }
    ]
    with _patched(_world([_product("p1", "Urea", [])], reconciliation=recon)):
        row = (await reports.reconciliation(DEALER))["rows"][0]
    for key in ("marketplace_sales", "local_sales", "restocks_and_purchases", "losses", "ledger_total"):
        assert type(row[key]) is float, key
    assert (row["local_sales"], row["restocks_and_purchases"], row["marketplace_sales"]) == (0.0, 5.0, -3.0)


@pytest.mark.asyncio
async def test_the_reconciliation_reads_every_page_of_products():
    """B5 verification F1: one RPC call stopped at PostgREST's 1000 rows, so a dealer with 1201 products saw 1000 and
    an unbalanced product past the cap was never reported. The rows are read in pages in a total order."""
    client = _Client([_rows(1000), _rows(201, 1000)])
    with patch(f"{REPO}.get_user_scoped_client", AsyncMock(return_value=client)):
        rows = await repo.fetch_reconciliation("tok")
    assert len(rows) == 1201
    assert ("rpc", ("inventory_reconciliation", {})) in client.steps
    assert [a for name, a in client.steps if name == "range"] == [(0, 999), (1000, 1999)]
    assert [a for name, a in client.steps if name == "order"][-1] == ("product_id",)


@pytest.mark.asyncio
async def test_an_out_of_stock_product_that_sold_has_no_days_of_cover():
    """B5 verification F5: the product sold in the period, so it has a pace to divide by; being out of stock alone makes
    its cover null, not 0 and not a division of nothing."""
    products = [_product("p1", "Urea", [("shop", 0)], threshold=2)]
    movements = [_move("p1", "out", "LOCAL_SALE", 6)]
    with _patched(_world(products, movements)):
        low = await reports.low_out_of_stock(DEALER, TODAY - timedelta(days=2), TODAY)
    [row] = low["rows"]
    assert (row["status"], row["period_out"], row["daily_out"]) == ("out_of_stock", 6, 2)
    assert row["days_of_cover"] is None
