from typing import Any

from ..core.supabase_client import get_user_scoped_client

ORDER_SELECT = (
    "*, order_items(*, listing:listings(title,unit)), "
    "buyer:profiles!orders_buyer_id_fkey(id,full_name), seller:profiles!orders_seller_id_fkey(id,full_name)"
)


def fetch_listings_for_checkout(access_token: str, listing_ids: list[str]) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("listings")
        .select("id,status,quantity,price,owner_id")
        .in_("id", listing_ids)
        .execute()
        .data
        or []
    )


def get_available_stock(access_token: str, listing_ids: list[str]) -> list[dict]:
    response = get_user_scoped_client(access_token).rpc("available_stock", {"listing_ids": listing_ids}).execute()
    return response.data or []


def insert_order(access_token: str, buyer_id: str, seller_id: str, subtotal: float, delivery_charge: float) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("orders")
        .insert(
            {
                "buyer_id": buyer_id,
                "seller_id": seller_id,
                "status": "pending",
                "product_subtotal": subtotal,
                "delivery_charge": delivery_charge,
            }
        )
        .select()
        .single()
        .execute()
    )
    return response.data


def insert_order_items(access_token: str, order_id: str, items: list[dict[str, Any]]) -> None:
    get_user_scoped_client(access_token).table("order_items").insert(
        [{"order_id": order_id, **item} for item in items]
    ).execute()


def insert_order_status_history(
    access_token: str, order_id: str, from_status: str | None, to_status: str, changed_by: str
) -> None:
    get_user_scoped_client(access_token).table("order_status_history").insert(
        {"order_id": order_id, "from_status": from_status, "to_status": to_status, "changed_by": changed_by}
    ).execute()


def fetch_orders_for_user(access_token: str, user_id: str, as_: str) -> list[dict]:
    column = "buyer_id" if as_ == "buyer" else "seller_id"
    return (
        get_user_scoped_client(access_token)
        .table("orders")
        .select(ORDER_SELECT)
        .eq(column, user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_all_orders(access_token: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("orders")
        .select(ORDER_SELECT)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_order_by_id(access_token: str, order_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token).table("orders").select(ORDER_SELECT).eq("id", order_id).limit(1).execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def fetch_order_status_history(access_token: str, order_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("order_status_history")
        .select("*")
        .eq("order_id", order_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def update_order_status(access_token: str, order_id: str, status: str) -> None:
    get_user_scoped_client(access_token).table("orders").update({"status": status}).eq("id", order_id).execute()


def fetch_order_items_for_inventory(access_token: str, order_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("order_items")
        .select("listing_id,quantity")
        .eq("order_id", order_id)
        .execute()
        .data
        or []
    )
