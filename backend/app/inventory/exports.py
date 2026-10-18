"""Report exports (B5 sub-lane; SRDS §17, §45-§46): a report as a CSV file the dealer downloads through a short-lived
link.

The file is built in memory from the same report functions as the screens (reports.REPORTS), uploaded to the private
'inventory-exports' bucket under the dealer's own folder, and handed back as a signed link valid for ten minutes. It is
never written to the API's disk or to git: Supabase Storage holds application files (SRDS §45-§46). Nothing schedules
a cleanup job, so each export first removes that dealer's files older than a day.
"""

import csv
import io
import logging
import unicodedata
from datetime import UTC, date, datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, Request
from storage3.utils import StorageException

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.common.errors import AppHTTPException
from app.inventory import repository as repo
from app.inventory.reports import REPORTS, report_period
from app.inventory.schemas import ExportInput, ExportResult
from app.middleware.rate_limit import limiter

logger = logging.getLogger(__name__)

# How long the link in the answer opens the file. The app opens it straight away (a browser download or the share
# sheet), so ten minutes is ample even on a slow connection, while a link that is forwarded, logged or left in a chat
# stops opening soon after: it reaches the dealer's stock figures with no sign-in (BR-03/04). A new export makes a new
# link.
SIGNED_URL_SECONDS = 600
# How long a file stays in the bucket before the dealer's next export sweeps it: well past any link's life, so a file is
# never removed while its link still opens it.
KEEP_FOR = timedelta(hours=24)
UNAVAILABLE = "The export could not be saved right now. Try again in a few minutes."
# Each export reads the whole ledger of the period and writes a file, so it has its own limit under the 200/minute
# default (B5 verification F4: 40 files in 20 seconds), per session like every limit (middleware/rate_limit.py). Ten a
# minute is more than a dealer exporting each of the eight reports once.
EXPORTS_PER_MINUTE = 10
# How the Storage client fails. Besides its own error and the transport's, storage3 2.x cannot parse an error body that
# lacks its usual keys (the gateway's 502 when the storage service is down) and raises AttributeError ("'dict' object
# has no attribute 'text'") or, for a body that is not JSON, ValueError. Caught only around the Storage calls, so a
# programming error anywhere else is still a 500 with its traceback in the log (B5 verification F3).
STORAGE_FAILURES = (StorageException, httpx.HTTPError, AttributeError, ValueError)

# The columns of each report's file. A report with several lists (sales-split, analytics) is one table with a
# `section` column, so every file opens as a single sheet.
COLUMNS: dict[str, list[str]] = {
    "stock-summary": [
        "product_id",
        "sku",
        "name",
        "unit",
        "location_id",
        "location_name",
        "quantity",
        "period_in",
        "period_out",
    ],
    "valuation": ["product_id", "sku", "name", "unit", "quantity", "cost_price", "value", "period_in", "period_out"],
    "movements-by-source": ["source", "in", "out", "net", "movements"],
    "low-out-of-stock": [
        "product_id",
        "sku",
        "name",
        "unit",
        "location_id",
        "quantity",
        "reorder_threshold",
        "status",
        "period_out",
        "daily_out",
        "days_of_cover",
    ],
    "supplier-purchases": ["supplier_id", "supplier_name", "purchases", "quantity", "cost", "lines_without_cost"],
    "sales-split": ["section", "date", "product_id", "sku", "name", "marketplace", "local", "total"],
    "analytics": ["section", "date", "product_id", "sku", "name", "in", "out", "quantity", "out_quantity", "daily_out"],
    "reconciliation": [
        "product_id",
        "sku",
        "name",
        "marketplace_sales",
        "local_sales",
        "adjustments",
        "restocks_and_purchases",
        "losses",
        "transfers",
        "other",
        "ledger_total",
        "current_stock",
        "balanced",
    ],
}

# A spreadsheet runs a cell that starts with one of these as a formula (CSV injection), and product, supplier and
# location names are free text the dealer typed. NFKC maps their fullwidth forms (U+FF1D, U+FF0B, U+FF0D, U+FF20)
# onto them, and a spreadsheet may skip leading spaces and invisible characters before reading the first one (B5
# verification F6), so the test is on the first visible character.
FORMULA_STARTS = ("=", "+", "-", "@")
# Skipped before the first visible character: every Unicode space and separator, control characters (tab, CR, LF) and
# format characters (zero-width space, word joiner, byte order mark).
_INVISIBLE = ("Zs", "Zl", "Zp", "Cc", "Cf")


def _runs_as_formula(text: str) -> bool:
    for char in text:
        if unicodedata.category(char) in _INVISIBLE:
            continue
        return unicodedata.normalize("NFKC", char) in FORMULA_STARTS
    return False


# --- service ----------------------------------------------------------------------------------------------------------


def _cell(value: object) -> object:
    """Numbers stay unformatted, dates ISO, booleans plain words, an unknown value empty."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, str) and _runs_as_formula(value):
        return "'" + value
    return value


def table_rows(report: str, data: dict) -> list[dict]:
    """The report's rows as flat dicts keyed by COLUMNS[report]."""
    if report == "sales-split":
        return [{"section": "by_day", **row} for row in data["by_day"]] + [
            {"section": "by_product", **row} for row in data["by_product"]
        ]
    if report == "analytics":
        return (
            [{"section": "trend", **row} for row in data["trend"]]
            + [{"section": "fast_movers", **row} for row in data["fast_movers"]]
            + [{"section": "slow_movers", **row} for row in data["slow_movers"]]
            + [{"section": "best_sellers", **row} for row in data["best_sellers"]]
        )
    return list(data["rows"])


def to_csv(report: str, data: dict) -> bytes:
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=COLUMNS[report], extrasaction="ignore", restval="")
    writer.writeheader()
    for row in table_rows(report, data):
        writer.writerow({key: _cell(value) for key, value in row.items()})
    # utf-8-sig starts the file with the byte order mark. Without it Excel, which most dealers open a CSV in, reads the
    # file in the Windows code page and shows Urdu product and supplier names as gibberish; csv readers and browsers
    # skip the mark.
    return buffer.getvalue().encode("utf-8-sig")


async def _remove_expired(folder: str, now: datetime) -> None:
    """Deletes this dealer's exports older than KEEP_FOR. A failure here is logged, not raised: an old file left a
    little longer is harmless, and the upload that follows reports a real Storage outage itself."""
    try:
        files = await repo.list_exports(folder)
        expired = [
            f"{folder}/{item['name']}"
            for item in files
            # A folder placeholder has no created_at; only files are swept.
            if item.get("created_at") and now - datetime.fromisoformat(item["created_at"]) > KEEP_FOR
        ]
        if expired:
            await repo.remove_exports(expired)
    except STORAGE_FAILURES as exc:
        logger.warning("old inventory exports not removed: %s", type(exc).__name__)


async def create_export(user: AuthenticatedUser, report: str, date_from: date | None, date_to: date | None) -> dict:
    start, to = report_period(date_from, date_to)
    content = to_csv(report, await REPORTS[report](user, start, to))
    now = datetime.now(UTC)
    # The folder is the verified caller's own id, never a client value: the bucket's read policy and the service-role
    # writes both rest on that first path segment (20261024080000_inventory_exports.sql).
    folder = user.id
    path = f"{folder}/{report}-{now.strftime('%Y%m%dT%H%M%S%fZ')}.csv"
    await _remove_expired(folder, now)
    try:
        await repo.upload_export(path, content)
        url = await repo.sign_export(path, SIGNED_URL_SECONDS)
    except STORAGE_FAILURES as exc:
        logger.warning("inventory export failed: %s", type(exc).__name__)
        raise AppHTTPException(503, UNAVAILABLE, "service_unavailable") from exc
    if not url:
        raise AppHTTPException(503, UNAVAILABLE, "service_unavailable")
    return {"url": url, "expires_at": (now + timedelta(seconds=SIGNED_URL_SECONDS)).isoformat()}


# --- routes -----------------------------------------------------------------------------------------------------------

router = APIRouter()


@router.post("/exports", response_model=ExportResult, status_code=201)
@limiter.limit(f"{EXPORTS_PER_MINUTE}/minute")
async def post_export(request: Request, body: ExportInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    """One report as a CSV file; the link in the answer is valid for ten minutes."""
    # slowapi's decorator finds the request by this parameter's name to count the call; the handler has no other
    # use for it.
    del request
    return await create_export(user, body.report, body.from_, body.to)
