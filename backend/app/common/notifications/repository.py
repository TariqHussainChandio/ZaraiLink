from postgrest.types import CountMethod

from app.common.pagination import page_range
from app.common.rows import as_rows
from app.database.supabase_client import get_service_role_client, get_user_scoped_client


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


async def fetch_recipient(access_token: str, profile_id: str) -> tuple[str | None, str]:
    """The address and name an application decision email goes to. The name is read as the deciding admin, whose
    policies show every profile. The address lives only in Supabase Auth (profiles holds no email), which the admin's
    token cannot read, so it comes from the Auth admin API with the service-role client: one documented exception,
    read-only, for the account the admin just decided."""
    client = await get_user_scoped_client(access_token)
    response = await client.table("profiles").select("full_name").eq("id", profile_id).limit(1).execute()
    rows = as_rows(response)
    full_name = rows[0]["full_name"] if rows else ""
    user = await get_service_role_client().auth.admin.get_user_by_id(profile_id)
    return (user.user.email if user and user.user else None), full_name
