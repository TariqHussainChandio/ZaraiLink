from typing import Any

from ..core.supabase_client import get_user_scoped_client

INVENTORY_SELECT = "*, listing:listings(id,title)"


# --- inventory ------------------------------------------------------------------------------


def fetch_inventory(access_token: str, dealer_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("inventory")
        .select(INVENTORY_SELECT)
        .eq("dealer_id", dealer_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_inventory_by_id(access_token: str, inventory_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("inventory")
        .select(INVENTORY_SELECT)
        .eq("id", inventory_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def fetch_dealer_listings(access_token: str, dealer_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("listings")
        .select("id,title")
        .eq("owner_id", dealer_id)
        .order("title")
        .execute()
        .data
        or []
    )


def create_inventory_item(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("inventory")
        .insert({"dealer_id": dealer_id, **fields})
        .select()
        .single()
        .execute()
    )
    return response.data


def update_inventory_item(access_token: str, inventory_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("inventory")
        .update(fields)
        .eq("id", inventory_id)
        .select()
        .single()
        .execute()
    )
    return response.data


def delete_inventory_item(access_token: str, inventory_id: str) -> None:
    get_user_scoped_client(access_token).table("inventory").delete().eq("id", inventory_id).execute()


def fetch_inventory_transactions(access_token: str, inventory_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("inventory_transactions")
        .select("*")
        .eq("inventory_id", inventory_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def adjust_stock(
    access_token: str, inventory_id: str, type_: str, quantity: int, actor_id: str, notes: str | None
) -> dict:
    """
    Single round-trip: `public.adjust_stock` (supabase/migrations/20260901130000_...) does the
    read-check-write atomically in one Postgres transaction, row-locked via `select ... for
    update`, instead of the old fetch-then-compute-then-write across two separate calls that let
    two concurrent adjustments race each other.
    """
    response = (
        get_user_scoped_client(access_token)
        .rpc(
            "adjust_stock",
            {
                "p_inventory_id": inventory_id,
                "p_type": type_,
                "p_quantity": quantity,
                "p_actor": actor_id,
                "p_notes": notes,
            },
        )
        .execute()
    )
    return response.data


# --- stores -----------------------------------------------------------------------------------


def fetch_stores(access_token: str, dealer_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("dealer_stores")
        .select("*")
        .eq("dealer_id", dealer_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_store_by_id(access_token: str, store_id: str) -> dict | None:
    response = get_user_scoped_client(access_token).table("dealer_stores").select("*").eq("id", store_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def create_store(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("dealer_stores")
        .insert({"dealer_id": dealer_id, **fields})
        .select()
        .single()
        .execute()
    )
    return response.data


def update_store(access_token: str, store_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("dealer_stores")
        .update(fields)
        .eq("id", store_id)
        .select()
        .single()
        .execute()
    )
    return response.data


def delete_store(access_token: str, store_id: str) -> None:
    get_user_scoped_client(access_token).table("dealer_stores").delete().eq("id", store_id).execute()


# --- suppliers --------------------------------------------------------------------------------


def fetch_suppliers(access_token: str, dealer_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("suppliers")
        .select("*")
        .eq("dealer_id", dealer_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_supplier_by_id(access_token: str, supplier_id: str) -> dict | None:
    response = get_user_scoped_client(access_token).table("suppliers").select("*").eq("id", supplier_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def create_supplier(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("suppliers")
        .insert({"dealer_id": dealer_id, **fields})
        .select()
        .single()
        .execute()
    )
    return response.data


def update_supplier(access_token: str, supplier_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("suppliers")
        .update(fields)
        .eq("id", supplier_id)
        .select()
        .single()
        .execute()
    )
    return response.data


def delete_supplier(access_token: str, supplier_id: str) -> None:
    get_user_scoped_client(access_token).table("suppliers").delete().eq("id", supplier_id).execute()
