from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_user_scoped_client


async def get_order_for_payment(access_token: str, order_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("orders").select("id,buyer_id,seller_id,status,total").eq("id", order_id).limit(1).execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def insert_payment(access_token: str, order_id: str, buyer_id: str, amount: float, method: str) -> dict:
    # N1 fix: insert() has no .select() on the pinned postgrest-py client — the write's own
    # returning=representation default already includes the full row.
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("payments")
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
        .execute()
    )
    return first_row(response)


async def fetch_payment_by_id(access_token: str, payment_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("payments").select("*").eq("id", payment_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_payment_by_order_id(access_token: str, order_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("payments").select("*").eq("order_id", order_id).order("created_at", desc=True).limit(1).execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_payment_transactions(access_token: str, payment_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("payment_transactions")
        .select("*")
        .eq("payment_id", payment_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def update_payment_status(access_token: str, payment_id: str, status: str) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("payments").update({"status": status}).eq("id", payment_id).execute()
    return first_row(response)
