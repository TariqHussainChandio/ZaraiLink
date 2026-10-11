"""Data access for the dealer Inventory Management System (B1, B2, B5). Every table call uses the dealer's own token, so
row-level security (owner and approved, no admin; BR-03/04, SRDS §15, §50) decides what is reached (the export files
are the one service-role exception, explained at EXPORTS_BUCKET); stock and the ledger change
only through the database functions in 20261021080000_inventory_data_model.sql and 20261022090000_inventory_sync.sql.
"""

from collections.abc import Callable
from typing import Any

from postgrest.exceptions import APIError
from postgrest.types import CountMethod

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_service_role_client, get_user_scoped_client

# Tables the dealer edits directly (the rest are written only by the stock functions).
EDITABLE_TABLES = ("inventory_locations", "inventory_suppliers", "inventory_products")


def _editable(table: str) -> None:
    # A plain check, not `assert`, which `python -O` strips.
    if table not in EDITABLE_TABLES:
        raise ValueError(f"{table} is not edited directly")


def _two_decimals(quantity: float) -> float:
    # The database refuses more than two decimals (B1: no silent rounding). A quantity the API computes (an adjustment
    # to an exact target, a float parsed from JSON) can carry float noise such as 3.2000000000000006, so it is rounded
    # here, where the value leaves Python, not left to fail in Postgres.
    return round(quantity, 2)


def _purchase_line(item: dict[str, Any]) -> dict[str, Any]:
    # Purchase lines are inserted directly (their table refuses more than two decimals too), so they get the same
    # rounding as the stock functions' quantities.
    line = {**item, "quantity": _two_decimals(item["quantity"])}
    if line.get("unit_cost") is not None:
        line["unit_cost"] = _two_decimals(line["unit_cost"])
    return line


async def list_rows(access_token: str, table: str, order: str = "created_at") -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table(table).select("*").order(order).range(*page_range()).execute()
    return as_rows(response)


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
    exclude_sources: list[str] | None = None,
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
    if exclude_sources:
        query = query.not_.in_("source", exclude_sources)
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
    client = await get_user_scoped_client(access_token)
    query = client.table("inventory_products").select(PRODUCT_SELECT)
    if not include_inactive:
        query = query.eq("is_active", True)
    query = query.order("name").order("id")
    if paged:
        query = query.range(*page_range())
    return as_rows(await query.execute())


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


async def unlink_product_listings(access_token: str, owner_id: str, product_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await (
        client.table("listings")
        .update({"inventory_product_id": None})
        .eq("owner_id", owner_id)
        .eq("inventory_product_id", product_id)
        .execute()
    )


# --- locations --------------------------------------------------------------------------------------------------------


async def fetch_default_location(access_token: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(await client.table("inventory_locations").select("*").eq("is_default", True).limit(1).execute())
    return rows[0] if rows else None


async def fetch_oldest_location(access_token: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(
        await client.table("inventory_locations").select("*").order("created_at").order("id").limit(1).execute()
    )
    return rows[0] if rows else None


async def clear_default_location(access_token: str, except_id: str) -> list[dict]:
    """Unsets the current default (returns the rows it changed), so another location can become it without breaking
    the one-default-per-dealer index (inventory_locations_one_default_idx)."""
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("inventory_locations")
        .update({"is_default": False})
        .eq("is_default", True)
        .neq("id", except_id)
        .execute()
    )
    return as_rows(response)


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


async def create_purchase(access_token: str, dealer_id: str, fields: dict[str, Any], items: list[dict]) -> dict:
    client = await get_user_scoped_client(access_token)
    purchase = first_row(await client.table("inventory_purchases").insert({**fields, "dealer_id": dealer_id}).execute())
    if items:
        rows = [{**_purchase_line(item), "purchase_id": purchase["id"], "dealer_id": dealer_id} for item in items]
        purchase["items"] = as_rows(await client.table("inventory_purchase_items").insert(rows).execute())
    else:
        purchase["items"] = []
    return purchase


async def update_purchase(access_token: str, purchase_id: str, fields: dict[str, Any]) -> dict:
    # The update policy matches only a draft, so a received or cancelled purchase updates nothing (404 from first_row).
    client = await get_user_scoped_client(access_token)
    return first_row(await client.table("inventory_purchases").update(fields).eq("id", purchase_id).execute())


async def replace_purchase_items(access_token: str, dealer_id: str, purchase_id: str, items: list[dict]) -> None:
    """Replaces a draft's lines. Two statements, not one transaction: if the insert is refused the draft is left with
    fewer lines (receive_purchase refuses one with none), and no stock moves until the dealer receives it."""
    client = await get_user_scoped_client(access_token)
    await client.table("inventory_purchase_items").delete().eq("purchase_id", purchase_id).execute()
    if items:
        rows = [{**_purchase_line(item), "purchase_id": purchase_id, "dealer_id": dealer_id} for item in items]
        await client.table("inventory_purchase_items").insert(rows).execute()


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


async def fetch_all_movements(access_token: str, since: str, before: str, columns: str) -> list[dict]:
    """The ledger between two ISO timestamps (`since` inclusive, `before` exclusive), oldest first."""
    client = await get_user_scoped_client(access_token)
    return await _every_page(
        lambda: (
            client.table("inventory_movements")
            .select(columns)
            .gte("created_at", since)
            .lt("created_at", before)
            .order("created_at")
            .order("id")
        )
    )


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
