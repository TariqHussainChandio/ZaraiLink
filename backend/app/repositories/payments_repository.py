from typing import Any

from ..core.supabase_client import get_user_scoped_client


def get_order_for_payment(access_token: str, order_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("orders")
        .select("id,buyer_id,seller_id,status,total")
        .eq("id", order_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def insert_payment(access_token: str, order_id: str, buyer_id: str, amount: float, method: str) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("payments")
        .insert(
            {
                "order_id": order_id,
                "buyer_id": buyer_id,
                "amount": amount,
                "method": method,
                "provider": "manual",
                "status": "pending",
            }
        )
        .select()
        .single()
        .execute()
    )
    return response.data


def fetch_payment_by_id(access_token: str, payment_id: str) -> dict | None:
    response = get_user_scoped_client(access_token).table("payments").select("*").eq("id", payment_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def fetch_payment_by_order_id(access_token: str, order_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("payments")
        .select("*")
        .eq("order_id", order_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def fetch_payment_transactions(access_token: str, payment_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("payment_transactions")
        .select("*")
        .eq("payment_id", payment_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def update_payment_status(access_token: str, payment_id: str, status: str) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("payments")
        .update({"status": status})
        .eq("id", payment_id)
        .select()
        .single()
        .execute()
    )
    return response.data


def insert_payment_transaction(access_token: str, payment_id: str, event_type: str, payload: dict[str, Any] | None) -> None:
    get_user_scoped_client(access_token).table("payment_transactions").insert(
        {"payment_id": payment_id, "event_type": event_type, "payload": payload}
    ).execute()
