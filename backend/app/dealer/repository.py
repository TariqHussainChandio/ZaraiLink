from typing import Any

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row, rpc_row
from app.database.supabase_client import get_user_scoped_client

INVENTORY_SELECT = "*, listing:listings(id,title)"


# --- inventory ------------------------------------------------------------------------------


async def fetch_inventory(access_token: str, dealer_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("inventory")
        .select(INVENTORY_SELECT)
        .eq("dealer_id", dealer_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def fetch_inventory_by_id(access_token: str, inventory_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("inventory").select(INVENTORY_SELECT).eq("id", inventory_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_dealer_listings(access_token: str, dealer_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("listings")
        .select("id,title")
        .eq("owner_id", dealer_id)
        .order("title")
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def create_inventory_item(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    # N1 fix: insert() returns a builder with no .select() on the pinned postgrest-py client
    # (see ai/repository.py's original P3 fix); the write's own returning=representation
    # default already includes the full row, so plain .execute() is enough.
    client = await get_user_scoped_client(access_token)
    response = await client.table("inventory").insert({"dealer_id": dealer_id, **fields}).execute()
    return first_row(response)


async def update_inventory_item(access_token: str, inventory_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("inventory").update(fields).eq("id", inventory_id).execute()
    return first_row(response)


async def delete_inventory_item(access_token: str, inventory_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("inventory").delete().eq("id", inventory_id).execute()


async def fetch_inventory_transactions(access_token: str, inventory_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("inventory_transactions")
        .select("*")
        .eq("inventory_id", inventory_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def adjust_stock(
    access_token: str, inventory_id: str, type_: str, quantity: int, actor_id: str, notes: str | None
) -> dict:
    """
    Single round-trip: `public.adjust_stock` (supabase/migrations/20260901130000_...) does the
    read-check-write atomically in one Postgres transaction, row-locked via `select ... for
    update`, instead of the old fetch-then-compute-then-write across two separate calls that let
    two concurrent adjustments race each other.
    """
    client = await get_user_scoped_client(access_token)
    response = await client.rpc(
        "adjust_stock",
        {
            "p_inventory_id": inventory_id,
            "p_type": type_,
            "p_quantity": quantity,
            "p_actor": actor_id,
            "p_notes": notes,
        },
    ).execute()
    return rpc_row(response)


# --- stores -----------------------------------------------------------------------------------


async def fetch_stores(access_token: str, dealer_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("dealer_stores")
        .select("*")
        .eq("dealer_id", dealer_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def fetch_store_by_id(access_token: str, store_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("dealer_stores").select("*").eq("id", store_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def create_store(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    # N1 fix — see create_inventory_item's comment above.
    client = await get_user_scoped_client(access_token)
    response = await client.table("dealer_stores").insert({"dealer_id": dealer_id, **fields}).execute()
    return first_row(response)


async def update_store(access_token: str, store_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("dealer_stores").update(fields).eq("id", store_id).execute()
    return first_row(response)


async def delete_store(access_token: str, store_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("dealer_stores").delete().eq("id", store_id).execute()


# --- suppliers --------------------------------------------------------------------------------


async def fetch_suppliers(access_token: str, dealer_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("suppliers")
        .select("*")
        .eq("dealer_id", dealer_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def fetch_supplier_by_id(access_token: str, supplier_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("suppliers").select("*").eq("id", supplier_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def create_supplier(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    # N1 fix — see create_inventory_item's comment above.
    client = await get_user_scoped_client(access_token)
    response = await client.table("suppliers").insert({"dealer_id": dealer_id, **fields}).execute()
    return first_row(response)


async def update_supplier(access_token: str, supplier_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("suppliers").update(fields).eq("id", supplier_id).execute()
    return first_row(response)


async def delete_supplier(access_token: str, supplier_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("suppliers").delete().eq("id", supplier_id).execute()
