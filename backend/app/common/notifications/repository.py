from postgrest.types import CountMethod

from app.common.pagination import page_range
from app.common.rows import as_rows
from app.database.supabase_client import get_user_scoped_client


async def fetch_notifications(access_token: str, user_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def fetch_unread_count(access_token: str, user_id: str) -> int:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("notifications")
        .select("*", count=CountMethod.exact, head=True)
        .eq("user_id", user_id)
        .eq("read", False)
        .execute()
    )
    return response.count or 0


async def get_notification(access_token: str, notification_id: str) -> dict | None:
    # `notifications_select_own` RLS already means a stranger's lookup naturally returns
    # nothing here — this repository call inherits that, it doesn't add its own filter.
    client = await get_user_scoped_client(access_token)
    response = await client.table("notifications").select("*").eq("id", notification_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def mark_read(access_token: str, notification_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("notifications").update({"read": True}).eq("id", notification_id).execute()


async def mark_all_read(access_token: str, user_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("notifications").update({"read": True}).eq("user_id", user_id).eq("read", False).execute()
