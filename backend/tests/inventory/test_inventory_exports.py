"""exports.py (B5; SRDS §17, §45-§46): the CSV a report becomes, where it is stored, how long its link lives, the
sweep of old files and the errors.

Storage is the faked edge here (repository.upload_export, sign_export, list_exports, remove_exports); the same export
is stored, signed, fetched over plain HTTP and parsed back on the real stack in
tests/integration/smoke/test_smoke_inventory_reports.py.
"""

import csv
import io
import logging
from datetime import UTC, date, datetime, timedelta
from typing import get_args
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient
from storage3 import AsyncStorageClient
from storage3.utils import StorageException

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.errors import AppHTTPException
from app.inventory import exports, reports, schemas
from app.main import app
from app.middleware.rate_limit import limiter


@pytest.fixture(autouse=True)
def _fresh_rate_limits():
    # POST /exports has its own per-session limit; each test starts with an empty count.
    limiter.reset()
    yield
    limiter.reset()


DEALER = AuthenticatedUser(
    id="0b7f3c1e-1111-4222-8333-444455556666", email="d@x.com", role="dealer", access_token="tok"
)
REPO = "app.inventory.repository"
BOM = b"\xef\xbb\xbf"


def _parse(content: bytes) -> list[list[str]]:
    assert content.startswith(BOM), "a spreadsheet reads Urdu names right only with the UTF-8 byte order mark"
    return list(csv.reader(io.StringIO(content[len(BOM) :].decode("utf-8"), newline="")))


def _summary(*rows: dict) -> dict:
    return {"from": "2026-09-01", "to": "2026-09-30", "generated_at": "x", "rows": list(rows), "total_quantity": 0}


def _stock_row(name: str, **more) -> dict:
    return {
        "product_id": "p1",
        "sku": "SKU-1",
        "name": name,
        "unit": "bag",
        "location_id": "l1",
        "location_name": "Shop",
        "quantity": 12.5,
        "period_in": 3.0,
        "period_out": 0.0,
        **more,
    }


# --- the CSV ----------------------------------------------------------------------------------------------------------


def test_every_report_has_its_columns_and_every_column_is_a_field_of_its_rows():
    assert set(exports.COLUMNS) == set(get_args(schemas.ReportName)) == set(reports.REPORTS)
    row_models = {
        "stock-summary": [schemas.StockSummaryRow],
        "valuation": [schemas.ValuationRow],
        "movements-by-source": [schemas.SourceTotal],
        "low-out-of-stock": [schemas.LowStockRow],
        "supplier-purchases": [schemas.SupplierPurchaseRow],
        "sales-split": [schemas.SalesDay, schemas.SalesProduct],
        "analytics": [schemas.TrendPoint, schemas.MoverRow, schemas.BestSellerRow],
        "reconciliation": [schemas.ReconciliationReportRow],
    }
    for report, models in row_models.items():
        fields = {"section"} | {(info.alias or name) for model in models for name, info in model.model_fields.items()}
        missing = set(exports.COLUMNS[report]) - fields
        assert not missing, (report, missing)


def test_a_file_has_the_header_and_one_line_per_row():
    content = exports.to_csv("stock-summary", _summary(_stock_row("Urea"), _stock_row("DAP", quantity=0)))
    lines = _parse(content)
    assert lines[0] == exports.COLUMNS["stock-summary"]
    assert lines[1:] == [
        ["p1", "SKU-1", "Urea", "bag", "l1", "Shop", "12.5", "3.0", "0.0"],
        ["p1", "SKU-1", "DAP", "bag", "l1", "Shop", "0", "3.0", "0.0"],
    ]


def test_an_empty_report_is_the_header_alone():
    assert _parse(exports.to_csv("stock-summary", _summary())) == [exports.COLUMNS["stock-summary"]]


@pytest.mark.parametrize(
    "name",
    [
        'Urea, 50 kg "Premium"',
        "Two\nlines",
        "Carriage\r\nreturn",
        "یوریا کھاد، پچاس کلو",
        'ڈی اے پی "خاص", نیا',
        "  leading and trailing spaces  ",
    ],
)
def test_commas_quotes_newlines_and_urdu_come_back_exactly(name):
    lines = _parse(exports.to_csv("stock-summary", _summary(_stock_row(name, location_name=name))))
    assert len(lines) == 2  # a newline inside a name stays inside its quoted cell
    assert lines[1][2] == name
    assert lines[1][5] == name


@pytest.mark.parametrize(
    "name",
    ['=HYPERLINK("http://evil.test","x")', "+1+1", "-2+3", "@SUM(A1:A2)", "\t=1+1", "\r=1+1", "=یوریا"],
)
def test_a_cell_a_spreadsheet_would_run_as_a_formula_is_neutralised(name):
    lines = _parse(exports.to_csv("stock-summary", _summary(_stock_row(name, sku=name, unit=name, location_name=name))))
    for cell in (lines[1][1], lines[1][2], lines[1][3], lines[1][5]):
        assert cell == "'" + name
        assert cell[0] not in "=+-@\t\r"


def test_numbers_stay_numbers_even_when_negative():
    data = {
        "from": "x",
        "to": "x",
        "generated_at": "x",
        "rows": [{"source": "DAMAGE", "in": 0.0, "out": 3.5, "net": -3.5, "movements": 2}],
    }
    lines = _parse(exports.to_csv("movements-by-source", data))
    assert lines[1] == ["DAMAGE", "0.0", "3.5", "-3.5", "2"]


def test_unknown_values_are_empty_and_booleans_plain_words():
    data = {
        "generated_at": "x",
        "unbalanced": 1,
        "rows": [
            {
                "product_id": "p1",
                "sku": "S",
                "name": "N",
                "marketplace_sales": -2,
                "local_sales": 0,
                "adjustments": 0,
                "restocks_and_purchases": 5,
                "losses": 0,
                "transfers": 0,
                "other": 0,
                "ledger_total": 3,
                "current_stock": 4,
                "balanced": False,
            }
        ],
    }
    assert _parse(exports.to_csv("reconciliation", data))[1][-1] == "false"
    valuation = {
        "rows": [
            {
                "product_id": "p",
                "sku": "s",
                "name": "n",
                "unit": "bag",
                "quantity": 1,
                "cost_price": None,
                "value": None,
                "period_in": 0,
                "period_out": 0,
            }
        ]
    }
    assert _parse(exports.to_csv("valuation", valuation))[1][5:7] == ["", ""]


def test_a_report_with_several_lists_is_one_table_with_a_section_column():
    data = {
        "by_day": [{"date": "2026-09-01", "marketplace": 2.0, "local": 1.0}],
        "by_product": [{"product_id": "p1", "sku": "S", "name": "N", "marketplace": 2.0, "local": 1.0, "total": 3.0}],
    }
    lines = _parse(exports.to_csv("sales-split", data))
    assert [line[0] for line in lines[1:]] == ["by_day", "by_product"]
    assert lines[1] == ["by_day", "2026-09-01", "", "", "", "2.0", "1.0", ""]
    analytics = {
        "trend": [{"date": "2026-09-01", "in": 1.0, "out": 0.0}],
        "fast_movers": [{"product_id": "a", "sku": "A", "name": "A", "out_quantity": 4.0, "daily_out": 0.133}],
        "slow_movers": [],
        "best_sellers": [{"product_id": "a", "sku": "A", "name": "A", "quantity": 4.0}],
    }
    lines = _parse(exports.to_csv("analytics", analytics))
    assert [line[0] for line in lines[1:]] == ["trend", "fast_movers", "best_sellers"]


# --- storing, signing, sweeping ---------------------------------------------------------------------------------------


def _storage(files: list[dict] | None = None, url: str | None = "http://127.0.0.1:54321/storage/v1/object/sign/x"):
    return {
        "list_exports": AsyncMock(return_value=files or []),
        "remove_exports": AsyncMock(),
        "upload_export": AsyncMock(),
        "sign_export": AsyncMock(return_value=url),
    }


class _patched:
    def __init__(self, mocks: dict) -> None:
        self.stack = [patch(f"{REPO}.{name}", mock) for name, mock in mocks.items()]
        self.stack.append(patch.dict(exports.REPORTS, {"stock-summary": AsyncMock(return_value=_summary())}))
        self.mocks = mocks

    def __enter__(self) -> dict:
        for p in self.stack:
            p.start()
        return self.mocks

    def __exit__(self, *_exc) -> None:
        for p in self.stack:
            p.stop()


def test_the_link_is_short_lived():
    # Long enough for a slow phone connection to open the share sheet; short enough that a forwarded link dies soon.
    assert 60 <= exports.SIGNED_URL_SECONDS <= 15 * 60


@pytest.mark.asyncio
async def test_the_file_goes_under_the_dealers_own_folder_and_the_link_lives_ten_minutes():
    with _patched(_storage()) as storage:
        before = datetime.now(UTC)
        result = await exports.create_export(DEALER, "stock-summary", None, None)
    path, content = storage["upload_export"].await_args.args
    folder, name = path.split("/")
    assert folder == DEALER.id
    assert name.startswith("stock-summary-")
    assert name.endswith(".csv")
    assert content.startswith(BOM)
    assert storage["list_exports"].await_args.args == (DEALER.id,)
    assert storage["sign_export"].await_args.args == (path, exports.SIGNED_URL_SECONDS)
    expires = datetime.fromisoformat(result["expires_at"])
    assert (
        timedelta(seconds=exports.SIGNED_URL_SECONDS - 5)
        <= expires - before
        <= timedelta(seconds=exports.SIGNED_URL_SECONDS + 5)
    )
    assert result["url"].startswith("http://127.0.0.1:54321/")


@pytest.mark.asyncio
async def test_files_older_than_a_day_are_swept_and_newer_ones_kept():
    now = datetime.now(UTC)
    files = [
        {"name": "old.csv", "created_at": (now - timedelta(hours=25)).isoformat().replace("+00:00", "Z")},
        {"name": "new.csv", "created_at": (now - timedelta(hours=1)).isoformat()},
        {"name": ".emptyFolderPlaceholder", "created_at": None},
    ]
    with _patched(_storage(files)) as storage:
        await exports.create_export(DEALER, "stock-summary", None, None)
    storage["remove_exports"].assert_awaited_once_with([f"{DEALER.id}/old.csv"])


@pytest.mark.asyncio
async def test_nothing_is_removed_when_nothing_is_old():
    with _patched(_storage([{"name": "new.csv", "created_at": datetime.now(UTC).isoformat()}])) as storage:
        await exports.create_export(DEALER, "stock-summary", None, None)
    storage["remove_exports"].assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "failure",
    [StorageException({"statusCode": 500}), httpx.ConnectError("down"), ValueError("bad created_at")],
)
async def test_a_failed_sweep_is_logged_and_the_export_still_made(failure, caplog):
    storage = _storage()
    storage["list_exports"] = AsyncMock(side_effect=failure)
    with _patched(storage), caplog.at_level(logging.WARNING):
        result = await exports.create_export(DEALER, "stock-summary", None, None)
    assert result["url"]
    storage["upload_export"].assert_awaited_once()
    assert "old inventory exports not removed" in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize("step", ["upload_export", "sign_export"])
@pytest.mark.parametrize(
    "failure", [StorageException({"statusCode": 500, "message": "secret"}), httpx.ReadTimeout("t")]
)
async def test_a_storage_failure_is_a_plain_503(step, failure):
    storage = _storage()
    storage[step] = AsyncMock(side_effect=failure)
    with _patched(storage), pytest.raises(AppHTTPException) as caught:
        await exports.create_export(DEALER, "stock-summary", None, None)
    assert (caught.value.status_code, caught.value.code) == (503, "service_unavailable")
    assert caught.value.detail == exports.UNAVAILABLE


@pytest.mark.asyncio
async def test_a_link_storage_did_not_give_is_a_503():
    with _patched(_storage(url=None)), pytest.raises(AppHTTPException) as caught:
        await exports.create_export(DEALER, "stock-summary", None, None)
    assert caught.value.status_code == 503


@pytest.mark.asyncio
async def test_a_bad_period_is_refused_before_anything_is_read_or_stored():
    with _patched(_storage()) as storage:
        report = exports.REPORTS["stock-summary"]
        with pytest.raises(AppHTTPException) as caught:
            await exports.create_export(DEALER, "stock-summary", date(2026, 9, 2), date(2026, 9, 1))
    assert caught.value.status_code == 422
    storage["upload_export"].assert_not_awaited()
    report.assert_not_awaited()


# --- the route --------------------------------------------------------------------------------------------------------


@pytest.fixture
def client():
    app.dependency_overrides[get_current_user] = lambda: DEALER
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)


def test_the_route_answers_201_with_the_link(client):
    with _patched(_storage()):
        response = client.post("/api/v1/inventory/exports", json={"report": "stock-summary"})
    assert response.status_code == 201, response.text
    assert set(response.json()) == {"url", "expires_at"}


def test_a_folder_or_owner_in_the_body_is_ignored(client):
    other = "99999999-9999-4999-8999-999999999999"
    with _patched(_storage()) as storage:
        response = client.post(
            "/api/v1/inventory/exports",
            json={"report": "stock-summary", "dealer_id": other, "path": f"{other}/x.csv", "folder": other},
        )
    assert response.status_code == 201, response.text
    assert storage["upload_export"].await_args.args[0].startswith(f"{DEALER.id}/")


@pytest.mark.parametrize(
    "body",
    [
        {"report": "everything"},
        {"report": "../../etc/passwd"},
        {},
        {"report": "valuation", "from": "2026-09-01T00:00:00"},
        {"report": "valuation", "from": 1790812800},
        {"report": "valuation", "from": "2026-09-02", "to": "2026-09-01"},
        {"report": "valuation", "from": "2025-01-01", "to": "2026-09-01"},
        {"report": "valuation", "to": "9999-12-31"},
    ],
)
def test_a_bad_request_is_refused_and_stores_nothing(client, body):
    with _patched(_storage()) as storage:
        response = client.post("/api/v1/inventory/exports", json=body)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_failed"
    storage["upload_export"].assert_not_awaited()


def test_a_storage_outage_answers_503_problem_json(client):
    storage = _storage()
    storage["upload_export"] = AsyncMock(side_effect=StorageException({"statusCode": 500, "message": "internal"}))
    with _patched(storage):
        response = client.post("/api/v1/inventory/exports", json={"report": "stock-summary"})
    assert response.status_code == 503
    assert response.json()["code"] == "service_unavailable"
    assert "internal" not in response.text


@pytest.mark.parametrize("role", ["farmer", "buyer", "expert", "admin"])
def test_another_role_cannot_export(role):
    app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
        id="u", email="u@x.com", role=role, access_token="tok"
    )
    try:
        with _patched(_storage()) as storage:
            response = TestClient(app).post("/api/v1/inventory/exports", json={"report": "stock-summary"})
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 403
    storage["upload_export"].assert_not_awaited()


def test_an_export_needs_a_token():
    assert TestClient(app).post("/api/v1/inventory/exports", json={"report": "stock-summary"}).status_code == 401


@pytest.mark.asyncio
async def test_the_reconciliation_file_has_the_bom_and_one_number_style():
    """The reconciliation goes through the report function and to_csv like every other report: the byte order mark,
    and 0.0 beside -3.0, not 0 beside -3.0."""
    rows = [
        {
            "product_id": "p1",
            "marketplace_sales": -3.0,
            "local_sales": 0,
            "adjustments": 0,
            "restocks_and_purchases": 5,
            "losses": 0,
            "transfers": 0,
            "other": 0,
            "ledger_total": 2,
            "current_stock": 2,
            "balanced": True,
        }
    ]
    products = [{"id": "p1", "sku": "S", "name": "N", "unit": "bag", "is_active": True, "stock": []}]
    with (
        patch(f"{REPO}.fetch_reconciliation", AsyncMock(return_value=rows)),
        patch(f"{REPO}.fetch_all_products", AsyncMock(return_value=products)),
        patch(f"{REPO}.fetch_default_location", AsyncMock(return_value=None)),
    ):
        data = await exports.REPORTS["reconciliation"](DEALER, date(2026, 9, 1), date(2026, 9, 30))
    lines = _parse(exports.to_csv("reconciliation", data))
    assert lines[1] == ["p1", "S", "N", "-3.0", "0.0", "0.0", "5.0", "0.0", "0.0", "0.0", "2.0", "2.0", "true"]


def test_an_out_of_stock_row_has_a_blank_days_of_cover():
    data = {
        "rows": [
            {
                "product_id": "p",
                "sku": "s",
                "name": "n",
                "unit": "bag",
                "location_id": "l",
                "quantity": 0.0,
                "reorder_threshold": 1.0,
                "status": "out_of_stock",
                "period_out": 2.0,
                "daily_out": 0.067,
                "days_of_cover": None,
            }
        ]
    }
    assert _parse(exports.to_csv("low-out-of-stock", data))[1][-1] == ""


# --- B5 verification findings -----------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    [
        " =1+1",
        "   @SUM(A1)",
        "\n=1+1",
        "\u200b=1+1",  # zero-width space
        "\ufeff+1",  # a byte order mark inside a cell
        "\u00a0-2",  # no-break space
        "\u2060@x",  # word joiner
        "\uff1d1+1",  # fullwidth forms a spreadsheet may read as the ASCII ones
        "\uff0b1",
        "\uff0d1",
        "\uff20x",
        " \u200b \uff1dHYPERLINK(1)",
    ],
)
def test_a_formula_behind_whitespace_invisible_characters_or_fullwidth_forms_is_neutralised(name):
    """F6: the first visible character decides, and fullwidth = + - @ count as the ASCII ones."""
    lines = _parse(exports.to_csv("stock-summary", _summary(_stock_row(name))))
    assert lines[1][2] == "'" + name


@pytest.mark.parametrize("name", ["Urea - 50 kg", "A+B mix", "user@depot", "  plain", "\u200bplain", "", "   "])
def test_text_with_a_formula_character_later_on_is_left_as_it_is(name):
    lines = _parse(exports.to_csv("stock-summary", _summary(_stock_row(name))))
    assert lines[1][2] == name


def _storage_down_client() -> AsyncStorageClient:
    """The real storage3 client, its HTTP answered the way the gateway answers with the storage container stopped: a
    502 whose JSON has a message and nothing else (B5 verification F3)."""

    def answer(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(502, json={"message": "An invalid response was received from the upstream server"})

    http = httpx.AsyncClient(transport=httpx.MockTransport(answer))
    return AsyncStorageClient("http://127.0.0.1:54321/storage/v1", {"apikey": "k"}, http_client=http)


@pytest.mark.asyncio
async def test_storage_down_is_the_designed_503_not_a_500():
    """storage3 cannot parse the gateway's error body (`'dict' object has no attribute 'text'`); the export still
    answers 503 "could not be saved right now"."""
    client = type("C", (), {"storage": _storage_down_client()})()
    with (
        patch(f"{REPO}.get_service_role_client", return_value=client),
        patch.dict(exports.REPORTS, {"stock-summary": AsyncMock(return_value=_summary())}),
        pytest.raises(AppHTTPException) as caught,
    ):
        await exports.create_export(DEALER, "stock-summary", None, None)
    assert (caught.value.status_code, caught.value.code) == (503, "service_unavailable")
    assert caught.value.detail == exports.UNAVAILABLE


@pytest.mark.asyncio
async def test_a_programming_error_outside_storage_is_not_dressed_up_as_an_outage():
    with (
        _patched(_storage()),
        patch.object(exports, "to_csv", side_effect=AttributeError("a real bug")),
        pytest.raises(AttributeError, match="a real bug"),
    ):
        await exports.create_export(DEALER, "stock-summary", None, None)


def test_exports_have_their_own_tighter_limit(client):
    """F4: one dealer made 40 files in 20 s under the 200/minute default. Exports get EXPORTS_PER_MINUTE a session."""
    with _patched(_storage()) as storage:
        statuses = [
            client.post("/api/v1/inventory/exports", json={"report": "stock-summary"}).status_code
            for _ in range(exports.EXPORTS_PER_MINUTE + 1)
        ]
        limited = client.post("/api/v1/inventory/exports", json={"report": "stock-summary"})
    assert statuses == [201] * exports.EXPORTS_PER_MINUTE + [429]
    assert limited.json()["code"] == "rate_limited"
    assert storage["upload_export"].await_count == exports.EXPORTS_PER_MINUTE
    assert exports.EXPORTS_PER_MINUTE <= 20
