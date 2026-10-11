"""Data access for the dealer Inventory Management System (B1, B2, B5). Every table call uses the dealer's own token, so
row-level security (owner and approved, no admin; BR-03/04, SRDS §15, §50) decides what is reached (the export files
are the one service-role exception, explained at EXPORTS_BUCKET); stock and the ledger change
only through the database functions in 20261021080000_inventory_data_model.sql and 20261022090000_inventory_sync.sql.
"""

from collections.abc import Callable
from typing import Any

from postgrest.exceptions import APIError
from postgrest.types import CountMethod

from app.common.pagination import MAX_LIMIT, page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_service_role_client, get_user_scoped_client

# Tables the dealer edits directly (the rest are written only by the stock functions).
EDITABLE_TABLES = ("inventory_locations", "inventory_suppliers", "inventory_products")


def _editable(table: str) -> None:
    # A plain check, not `assert`, which `python -O` strips.
    if table not in EDITABLE_TABLES:
        raise ValueError(f"{table} is not edited directly")


def _two_decimals(quantity: float) -> float:
    # The database refuses more than two decimals (B1: no silent rounding), and so do the request schemas
    # (schemas.Quantity), so a figure the dealer typed never reaches here with a third decimal. A quantity the API
    # computes (the legacy adjustment to an exact target, 9.1 - 5.9) can carry float noise such as 3.2000000000000006;
    # that noise is cleared here, where the value leaves Python, rather than left to fail in Postgres.
    return round(quantity, 2)


_LINE_COLUMNS = ("product_id", "location_id", "quantity", "unit_cost")


def _purchase_line(item: dict[str, Any]) -> dict[str, Any]:
    # A purchase line exactly as create_purchase and replace_purchase_items take it: these four keys and no other (the
    # functions refuse any other key), figures cleared of float noise like the stock functions' quantities.
    line = {key: item.get(key) for key in _LINE_COLUMNS}
    line["quantity"] = _two_decimals(item["quantity"])
    if line["unit_cost"] is not None:
        line["unit_cost"] = _two_decimals(line["unit_cost"])
    return line


async def list_rows(access_token: str, table: str, order: str = "created_at") -> list[dict]:
    """The request's page of rows, or every row when the request has no page. A page is at most MAX_LIMIT rows, so a
    wider range is pagination's unpaged default (PostgREST's whole cap): the dealer analytics count the stores and
    suppliers this way, and a count from one capped read would stop at 1000."""
    client = await get_user_scoped_client(access_token)

    def build() -> Any:
        return client.table(table).select("*").order(order).order("id")

    start, end = page_range()
    if end - start + 1 > MAX_LIMIT:
        return await _every_page(build)
    return as_rows(await build().range(start, end).execute())


async def list_active_or_all(access_token: str, table: str, include_inactive: bool, order: str = "name") -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table(table).select("*")
    if not include_inactive:
        query = query.eq("is_active", True)
    return as_rows(await query.order(order).order("id").range(*page_range()).execute())


async def fetch_row(access_token: str, table: str, row_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(await client.table(table).select("*").eq("id", row_id).limit(1).execute())
    return rows[0] if rows else None


async def create_row(access_token: str, table: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    _editable(table)
    client = await get_user_scoped_client(access_token)
    return first_row(await client.table(table).insert({**fields, "dealer_id": dealer_id}).execute())


async def update_row(access_token: str, table: str, row_id: str, fields: dict[str, Any]) -> dict:
    _editable(table)
    client = await get_user_scoped_client(access_token)
    return first_row(await client.table(table).update(fields).eq("id", row_id).execute())


async def delete_row(access_token: str, table: str, row_id: str) -> None:
    # A product or location with ledger history cannot be deleted (on delete restrict); deactivate it instead.
    _editable(table)
    client = await get_user_scoped_client(access_token)
    await client.table(table).delete().eq("id", row_id).execute()


async def delete_or_deactivate(access_token: str, table: str, row_id: str) -> None:
    """Deletes a row with no history; one that stock rows or ledger movements point at is kept (the ledger must stay
    whole, SRDS §24-§25; those foreign keys are `on delete restrict`) and deactivated instead."""
    _editable(table)
    client = await get_user_scoped_client(access_token)
    try:
        await client.table(table).delete().eq("id", row_id).execute()
    except APIError as exc:
        if exc.code != "23503":
            raise
        await client.table(table).update({"is_active": False}).eq("id", row_id).execute()


# --- stock and the ledger (read only) -------------------------------------------------------------------------------


async def fetch_stock(access_token: str, product_id: str | None = None, location_id: str | None = None) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("inventory_stock").select("*")
    if product_id:
        query = query.eq("product_id", product_id)
    if location_id:
        query = query.eq("location_id", location_id)
    return as_rows(await query.order("product_id").order("location_id").range(*page_range()).execute())


async def fetch_movements(
    access_token: str,
    product_id: str | None = None,
    location_id: str | None = None,
    sources: list[str] | None = None,
    direction: str | None = None,
    since: str | None = None,
    before: str | None = None,
    columns: str = "*",
    limit: int | None = None,
) -> list[dict]:
    """The ledger, newest first. `since` is inclusive and `before` exclusive (ISO timestamps). With no `limit` the
    request's page applies (or PostgREST's own row cap when the route is not paginated)."""
    client = await get_user_scoped_client(access_token)
    query = client.table("inventory_movements").select(columns)
    if product_id:
        query = query.eq("product_id", product_id)
    if location_id:
        query = query.eq("location_id", location_id)
    if sources:
        query = query.in_("source", sources)
    if direction:
        query = query.eq("direction", direction)
    if since:
        query = query.gte("created_at", since)
    if before:
        query = query.lt("created_at", before)
    query = query.order("created_at", desc=True).order("id", desc=True)
    query = query.limit(limit) if limit is not None else query.range(*page_range())
    return as_rows(await query.execute())


async def fetch_transfer_movements(access_token: str, transfer_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("inventory_movements").select("*").eq("transfer_id", transfer_id).order("direction").execute()
    )
    return as_rows(response)


async def record_movement(
    access_token: str,
    product_id: str,
    location_id: str,
    direction: str,
    source: str,
    quantity: float,
    reason: str | None,
) -> str:
    client = await get_user_scoped_client(access_token)
    response = await client.rpc(
        "record_movement",
        {
            "p_product_id": product_id,
            "p_location_id": location_id,
            "p_direction": direction,
            "p_source": source,
            "p_quantity": _two_decimals(quantity),
            "p_reason": reason,
        },
    ).execute()
    return str(response.data)


async def transfer_stock(
    access_token: str, product_id: str, from_location_id: str, to_location_id: str, quantity: float, reason: str | None
) -> str:
    client = await get_user_scoped_client(access_token)
    response = await client.rpc(
        "transfer_stock",
        {
            "p_product_id": product_id,
            "p_from_location_id": from_location_id,
            "p_to_location_id": to_location_id,
            "p_quantity": _two_decimals(quantity),
            "p_reason": reason,
        },
    ).execute()
    return str(response.data)


# --- products ---------------------------------------------------------------------------------------------------------

# A product with its stock rows and the listings linked to it (listings.inventory_product_id, D8). Each embed follows
# the single foreign key its table has to inventory_products, and row-level security still filters each one.
PRODUCT_SELECT = "*, stock:inventory_stock(location_id,quantity), listings(id,title)"


async def fetch_products(access_token: str, include_inactive: bool = False, paged: bool = True) -> list[dict]:
    """The request's page of products, or with `paged=False` every one of them, read page by page (the alerts, the
    dashboard and the dealer analytics weigh every product; a single read would stop at PostgREST's 1000 rows)."""
    client = await get_user_scoped_client(access_token)

    def build() -> Any:
        query = client.table("inventory_products").select(PRODUCT_SELECT)
        if not include_inactive:
            query = query.eq("is_active", True)
        return query.order("name").order("id")

    if not paged:
        return await _every_page(build)
    return as_rows(await build().range(*page_range()).execute())


async def fetch_product(access_token: str, product_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(
        await client.table("inventory_products").select(PRODUCT_SELECT).eq("id", product_id).limit(1).execute()
    )
    return rows[0] if rows else None


# --- the dealer's own listings (only the link column is written here) -------------------------------------------------


async def fetch_owned_listing(access_token: str, owner_id: str, listing_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(
        await client.table("listings")
        .select("id,title,inventory_product_id")
        .eq("id", listing_id)
        .eq("owner_id", owner_id)
        .limit(1)
        .execute()
    )
    return rows[0] if rows else None


async def set_listing_product(access_token: str, owner_id: str, listing_id: str, product_id: str | None) -> dict:
    """Links (or, with None, unlinks) one of the dealer's own listings. The owner filter and the listings policy keep it
    to their listings; guard_inventory_references refuses a product that is not theirs (42501)."""
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("listings")
        .update({"inventory_product_id": product_id})
        .eq("id", listing_id)
        .eq("owner_id", owner_id)
        .execute()
    )
    return first_row(response)


async def link_unlinked_listing(access_token: str, owner_id: str, listing_id: str, product_id: str) -> bool:
    """Links one of the dealer's own listings to a product only while the listing has none (B2 re-verification N1).
    Two concurrent creates both read the listing unlinked; this update takes the row lock, and the second one re-reads
    the row after the first commits, finds the link set and matches nothing. Returns whether the listing was taken."""
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("listings")
        .update({"inventory_product_id": product_id})
        .eq("id", listing_id)
        .eq("owner_id", owner_id)
        .is_("inventory_product_id", "null")
        .execute()
    )
    return bool(as_rows(response))


async def unlink_product_listings(
    access_token: str, owner_id: str, product_id: str, except_listing_id: str | None = None
) -> None:
    """Lets go of the product's listings (they fall back to their own quantity), sparing `except_listing_id`: an edit
    that moved the product to a new listing clears only the old links, after the new one holds."""
    client = await get_user_scoped_client(access_token)
    query = (
        client.table("listings")
        .update({"inventory_product_id": None})
        .eq("owner_id", owner_id)
        .eq("inventory_product_id", product_id)
    )
    if except_listing_id is not None:
        query = query.neq("id", except_listing_id)
    await query.execute()


# --- locations --------------------------------------------------------------------------------------------------------


async def fetch_default_location(access_token: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(await client.table("inventory_locations").select("*").eq("is_default", True).limit(1).execute())
    return rows[0] if rows else None


async def fetch_oldest_location(access_token: str) -> dict | None:
    """The dealer's oldest active location (an inactive one cannot become the default, stock.INACTIVE_DEFAULT)."""
    client = await get_user_scoped_client(access_token)
    rows = as_rows(
        await client.table("inventory_locations")
        .select("*")
        .eq("is_active", True)
        .order("created_at")
        .order("id")
        .limit(1)
        .execute()
    )
    return rows[0] if rows else None


async def set_default_location(access_token: str, location_id: str) -> None:
    """Moves the dealer's default to one of their active locations in one transaction (set_default_location, B2
    verification F7). Clearing the old default and setting the new one as two calls is refused at commit by
    check_inventory_default_location: a dealer with locations always has a default."""
    client = await get_user_scoped_client(access_token)
    await client.rpc("set_default_location", {"p_location_id": location_id}).execute()


# --- purchases --------------------------------------------------------------------------------------------------------


PURCHASE_SELECT = "*, items:inventory_purchase_items(*)"


async def fetch_purchases(access_token: str, status: str | None = None, limit: int | None = None) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("inventory_purchases").select(PURCHASE_SELECT)
    if status:
        query = query.eq("status", status)
    query = query.order("purchased_on", desc=True).order("created_at", desc=True)
    query = query.limit(limit) if limit is not None else query.range(*page_range())
    return as_rows(await query.execute())


async def fetch_purchase(access_token: str, purchase_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(
        await client.table("inventory_purchases").select(PURCHASE_SELECT).eq("id", purchase_id).limit(1).execute()
    )
    return rows[0] if rows else None


async def create_purchase(access_token: str, fields: dict[str, Any], items: list[dict]) -> str:
    """A draft and its lines in one transaction (create_purchase, B2 verification F1/F2); returns its id. The function
    checks every supplier, product and location is the dealer's and every location active, and a refusal writes
    nothing: there is no half-written purchase to clean up. A missing date is today."""
    client = await get_user_scoped_client(access_token)
    response = await client.rpc(
        "create_purchase",
        {
            "p_supplier_id": fields.get("supplier_id"),
            "p_purchased_on": fields.get("purchased_on"),
            "p_reference": fields.get("reference"),
            "p_notes": fields.get("notes"),
            "p_items": [_purchase_line(item) for item in items],
        },
    ).execute()
    return str(response.data)


async def update_purchase(access_token: str, purchase_id: str, fields: dict[str, Any]) -> dict:
    # A header-only edit, and cancel. The update policy matches only a draft, so a received or cancelled purchase
    # updates nothing (404 from first_row). One statement, so it queues on the row lock replace_purchase_items and
    # receive_purchase take.
    client = await get_user_scoped_client(access_token)
    return first_row(await client.table("inventory_purchases").update(fields).eq("id", purchase_id).execute())


async def replace_purchase_items(
    access_token: str, purchase_id: str, items: list[dict], header: dict[str, Any] | None
) -> None:
    """Replaces every line of a draft, and applies `header` (supplier_id, purchased_on, reference, notes) when given,
    in one transaction under the purchase's row lock (replace_purchase_items, B2 verification F1/F2). Concurrent edits
    run one after the other, so the last one's lines win and none are doubled; an edit and a receive never interleave.
    `items` is the complete list: [] empties the draft."""
    client = await get_user_scoped_client(access_token)
    await client.rpc(
        "replace_purchase_items",
        {"p_purchase_id": purchase_id, "p_items": [_purchase_line(item) for item in items], "p_header": header},
    ).execute()


async def receive_purchase(access_token: str, purchase_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.rpc("receive_purchase", {"p_purchase_id": purchase_id}).execute()


# --- alerts and settings ----------------------------------------------------------------------------------------------


async def fetch_alert_settings(access_token: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(await client.table("inventory_alert_settings").select("*").limit(1).execute())
    return rows[0] if rows else None


async def upsert_alert_settings(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("inventory_alert_settings").upsert({**fields, "dealer_id": dealer_id}).execute()
    return first_row(response)


# --- marketplace sync (B3) --------------------------------------------------------------------------------------------


async def fetch_sync_log(access_token: str, status: str | None = None) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("inventory_sync_log").select("*")
    if status:
        query = query.eq("status", status)
    return as_rows(await query.order("processed_at", desc=True).range(*page_range()).execute())


async def count_sync_failures(access_token: str) -> int:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("inventory_sync_log")
        .select("id", count=CountMethod.exact)
        .eq("status", "failed")
        .limit(1)
        .execute()
    )
    return response.count or 0


async def retry_dispatch_events(access_token: str) -> int:
    """Applies the dealer's own pending dispatch events (retry_dispatch_events, SRDS §53.39); returns how many."""
    client = await get_user_scoped_client(access_token)
    response = await client.rpc("retry_dispatch_events", {}).execute()
    data = response.data
    return data if isinstance(data, int) else 0


async def fetch_reconciliation(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.rpc("inventory_reconciliation", {}).execute()
    return as_rows(response)


# --- reports and exports (B5) -----------------------------------------------------------------------------------------

# PostgREST's max_rows (supabase/config.toml): a request never returns more, so the report reads walk the rows in pages
# of this size. A report computed from a capped read would be silently wrong, not merely short (SRDS §25).
REPORT_PAGE = 1000


async def _every_page(build: Callable[[], Any]) -> list[dict]:
    """Every row of a query, one page at a time. `build` returns a fresh, fully ordered query each call (a builder's
    range mutates it), and the order must be total (ending in `id`) so no row falls between two pages."""
    rows: list[dict] = []
    offset = 0
    while True:
        batch = as_rows(await build().range(offset, offset + REPORT_PAGE - 1).execute())
        rows.extend(batch)
        if len(batch) < REPORT_PAGE:
            return rows
        offset += REPORT_PAGE


async def fetch_all_movements(
    access_token: str,
    since: str | None = None,
    before: str | None = None,
    columns: str = "*",
    sources: list[str] | None = None,
) -> list[dict]:
    """The ledger between two ISO timestamps (`since` inclusive, `before` exclusive; either may be left open), oldest
    first, optionally of some sources only."""
    client = await get_user_scoped_client(access_token)

    def build() -> Any:
        query = client.table("inventory_movements").select(columns)
        if sources:
            query = query.in_("source", sources)
        if since:
            query = query.gte("created_at", since)
        if before:
            query = query.lt("created_at", before)
        return query.order("created_at").order("id")

    return await _every_page(build)


# A product with its stock rows; the reports need no listings.
REPORT_PRODUCT_SELECT = "*, stock:inventory_stock(location_id,quantity)"


async def fetch_all_products(access_token: str) -> list[dict]:
    """Every product, inactive ones too: an inactive product can still hold stock or appear in the ledger."""
    client = await get_user_scoped_client(access_token)
    return await _every_page(
        lambda: client.table("inventory_products").select(REPORT_PRODUCT_SELECT).order("name").order("id")
    )


async def fetch_all_names(access_token: str, table: str) -> list[dict]:
    """`id` and `name` of every location or supplier, for labelling report rows."""
    if table not in ("inventory_locations", "inventory_suppliers"):
        raise ValueError(f"{table} has no report labels")
    client = await get_user_scoped_client(access_token)
    return await _every_page(lambda: client.table(table).select("id,name").order("id"))


async def fetch_received_purchases(access_token: str, since: str, before: str) -> list[dict]:
    """Purchases received between two ISO timestamps, with their lines. Drafts and cancelled purchases moved no stock,
    so they are no part of what a supplier delivered."""
    client = await get_user_scoped_client(access_token)
    return await _every_page(
        lambda: (
            client.table("inventory_purchases")
            .select("id,supplier_id,received_at,items:inventory_purchase_items(product_id,quantity,unit_cost)")
            .eq("status", "received")
            .gte("received_at", since)
            .lt("received_at", before)
            .order("received_at")
            .order("id")
        )
    )


# Export files live in the private 'inventory-exports' bucket (20261024080000_inventory_exports.sql), never on the
# API's disk or in git (SRDS §45-§46). The bucket has no write policy, so these calls use the service-role client: a
# documented exception (docs/architecture/backend-architecture.md) that is safe only because exports.py builds every
# path from the verified AuthenticatedUser's id (`{dealer_id}/...`), never from a client value.
EXPORTS_BUCKET = "inventory-exports"


async def list_exports(folder: str) -> list[dict]:
    """The files directly in one dealer's folder, oldest first (storage objects carry `name` and `created_at`)."""
    bucket = get_service_role_client().storage.from_(EXPORTS_BUCKET)
    return await bucket.list(folder, {"limit": 1000, "sortBy": {"column": "created_at", "order": "asc"}})


async def remove_exports(paths: list[str]) -> None:
    await get_service_role_client().storage.from_(EXPORTS_BUCKET).remove(paths)


async def upload_export(path: str, content: bytes) -> None:
    # Bytes, not str: storage3 reads a str argument as a local file path to open.
    await get_service_role_client().storage.from_(EXPORTS_BUCKET).upload(path, content, {"content-type": "text/csv"})


async def sign_export(path: str, expires_in: int) -> str | None:
    response = await get_service_role_client().storage.from_(EXPORTS_BUCKET).create_signed_url(path, expires_in)
    # storage3 has returned the link under both spellings across versions.
    return response.get("signedUrl") or response.get("signedURL")
