from typing import Any

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_user_scoped_client

# buyer/seller read profiles_public (20260923080100_profiles_public_view.sql), not profiles
# directly — profiles' own RLS only lets a caller see their own row, so a buyer could never see
# the seller's name on their own order (and vice versa) otherwise.
ORDER_SELECT = (
    "*, order_items(*, listing:listings(title,unit)), "
    "buyer:profiles_public!orders_buyer_id_fkey(id,full_name), "
    "seller:profiles_public!orders_seller_id_fkey(id,full_name)"
)


async def fetch_listings_for_checkout(access_token: str, listing_ids: list[str]) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("listings").select("id,status,quantity,price,owner_id").in_("id", listing_ids).execute()
    )
    return as_rows(response)


async def get_available_stock(access_token: str, listing_ids: list[str]) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.rpc("available_stock", {"listing_ids": listing_ids}).execute()
    return as_rows(response)


async def insert_order(
    access_token: str, buyer_id: str, seller_id: str, subtotal: float, delivery_charge: float
) -> dict:
    # N1 fix: insert() has no .select() on the pinned postgrest-py client — the write's own
    # returning=representation default already includes the full row.
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("orders")
        .insert(
            {
                "buyer_id": buyer_id,
                "seller_id": seller_id,
                "status": "pending",
                "product_subtotal": subtotal,
                "delivery_charge": delivery_charge,
            }
        )
        .execute()
    )
    return first_row(response)


async def insert_order_items(access_token: str, order_id: str, items: list[dict[str, Any]]) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("order_items").insert([{"order_id": order_id, **item} for item in items]).execute()


async def fetch_orders_for_user(access_token: str, user_id: str, as_: str) -> list[dict]:
    column = "buyer_id" if as_ == "buyer" else "seller_id"
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("orders")
        .select(ORDER_SELECT)
        .eq(column, user_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def fetch_all_orders(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("orders").select(ORDER_SELECT).order("created_at", desc=True).range(*page_range()).execute()
    )
    return as_rows(response)


async def fetch_order_by_id(access_token: str, order_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("orders").select(ORDER_SELECT).eq("id", order_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_order_status_history(access_token: str, order_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("order_status_history")
        .select("*")
        .eq("order_id", order_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def update_order_status(access_token: str, order_id: str, status: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("orders").update({"status": status}).eq("id", order_id).execute()


async def fetch_stale_pending_order_ids(access_token: str, user_id: str, cutoff_iso: str) -> list[str]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("orders")
        .select("id")
        .eq("status", "pending")
        .lt("created_at", cutoff_iso)
        .or_(f"buyer_id.eq.{user_id},seller_id.eq.{user_id}")
        .execute()
    )
    return [row["id"] for row in as_rows(response)]
