"""alerts.py and dashboard.py: the low and out-of-stock rule (default location against the threshold, D8), the
settings defaults, and the dashboard figures computed from the products and the ledger."""

from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest

from app.auth.dependencies import AuthenticatedUser
from app.inventory import alerts, dashboard

DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")
REPO = "app.inventory.repository"


def _view(pid: str, quantity: float, threshold: float, name: str = "P", cost: float | None = None) -> dict:
    return {
        "id": pid,
        "sku": pid,
        "name": name,
        "unit": "bag",
        "reorder_threshold": threshold,
        "default_location_quantity": quantity,
        "total_quantity": quantity,
        "cost_price": cost,
    }


@pytest.mark.parametrize(
    ("quantity", "threshold", "status"),
    [(0, 0, "out_of_stock"), (0, 5, "out_of_stock"), (5, 5, "low_stock"), (0.01, 5, "low_stock"), (5.01, 5, None)],
)
def test_the_alert_rule(quantity, threshold, status):
    alert = alerts.stock_alert(_view("p", quantity, threshold), "shop")
    assert (alert["status"] if alert else None) == status
    if alert:
        assert alert["location_id"] == "shop"


def test_out_of_stock_comes_first_then_the_lowest_quantity():
    views = [_view("a", 3, 5, "A"), _view("b", 0, 1, "B"), _view("c", 1, 5, "C"), _view("d", 9, 5, "D")]
    assert [a["product_id"] for a in alerts.alerts_for(views, "shop")] == ["b", "c", "a"]


@pytest.mark.asyncio
async def test_alerts_weigh_every_active_product_not_a_page():
    with (
        patch(f"{REPO}.fetch_products", return_value=[]) as fetch,
        patch(f"{REPO}.fetch_default_location", return_value=None),
    ):
        await alerts.list_alerts(DEALER, "low_stock")
    assert fetch.call_args.kwargs == {"include_inactive": False, "paged": False}


@pytest.mark.asyncio
async def test_settings_never_saved_read_as_the_defaults_without_a_write():
    with patch(f"{REPO}.fetch_alert_settings", return_value=None), patch(f"{REPO}.upsert_alert_settings") as save:
        settings = await alerts.get_settings(DEALER)
    assert settings == {
        "dealer_id": DEALER.id,
        "default_reorder_threshold": 0,
        "notify_low_stock": True,
        "notify_sync_failure": True,
        "updated_at": None,
    }
    save.assert_not_called()


def _at(days_ago: int, hour: int = 12) -> str:
    day = datetime.now(UTC).date() - timedelta(days=days_ago)
    return datetime(day.year, day.month, day.day, hour, tzinfo=UTC).isoformat()


def test_the_trend_has_every_day_and_ignores_older_movements():
    rows = [
        {"direction": "in", "quantity": "10", "created_at": _at(0)},
        {"direction": "out", "quantity": 2.5, "created_at": _at(0, 1)},
        {"direction": "out", "quantity": 1, "created_at": _at(29)},
        {"direction": "in", "quantity": 99, "created_at": _at(30)},
    ]
    trend = dashboard.daily_trend(rows)
    assert len(trend) == 30
    assert trend[-1] == {"date": datetime.now(UTC).date().isoformat(), "in": 10.0, "out": 2.5}
    assert trend[0]["out"] == 1
    assert trend[0]["in"] == 0
    assert sum(p["in"] for p in trend) == 10


@pytest.mark.asyncio
async def test_the_trend_reads_every_page_of_the_window_and_leaves_transfers_out():
    rows = [
        {"direction": "in", "quantity": 1, "created_at": _at(0), "source": "RESTOCK"},
        {"direction": "out", "quantity": 1, "created_at": _at(0), "source": "TRANSFER"},
        {"direction": "in", "quantity": 1, "created_at": _at(0), "source": "TRANSFER"},
    ]
    with patch(f"{REPO}.fetch_all_movements", return_value=rows) as fetch:
        result = await dashboard.trend_movements(DEALER)
    today = datetime.now(UTC).date()
    assert fetch.call_args.kwargs["since"] == f"{today - timedelta(days=29)}T00:00:00+00:00"
    assert fetch.call_args.kwargs["before"] == f"{today + timedelta(days=1)}T00:00:00+00:00"
    assert [r["source"] for r in result] == ["RESTOCK"]


@pytest.mark.asyncio
async def test_the_dashboard_totals():
    products = [
        {**_view("a", 0, 0, "A", cost=10), "stock": [{"location_id": "shop", "quantity": 4}], "listings": []},
        {**_view("b", 0, 1, "B", cost=None), "stock": [{"location_id": "godown", "quantity": 6}], "listings": []},
        {**_view("c", 0, 2, "C", cost=2.5), "stock": [], "listings": []},
    ]
    with (
        patch(f"{REPO}.fetch_products", return_value=products),
        patch(f"{REPO}.fetch_default_location", return_value={"id": "shop"}),
        patch(f"{REPO}.fetch_movements", return_value=[]),
        patch(f"{REPO}.fetch_purchases", return_value=[]),
        patch(f"{REPO}.fetch_all_movements", return_value=[]),
        patch(f"{REPO}.count_sync_failures", return_value=2),
    ):
        result = await dashboard.build_dashboard(DEALER)
    # b holds 6 in the godown but none at the default shop, so it is out of stock for the marketplace (D8)
    assert result["totals"] == {
        "products": 3,
        "stock_units": 10,
        "low_stock": 0,
        "out_of_stock": 2,
        "inventory_value": 40.0,
    }
    assert result["sync_failures"] == 2
    assert len(result["trend"]) == 30
