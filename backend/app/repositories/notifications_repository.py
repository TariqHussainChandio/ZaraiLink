from ..core.supabase_client import get_user_scoped_client


def fetch_notifications(access_token: str, user_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_unread_count(access_token: str, user_id: str) -> int:
    response = (
        get_user_scoped_client(access_token)
        .table("notifications")
        .select("*", count="exact", head=True)
        .eq("user_id", user_id)
        .eq("read", False)
        .execute()
    )
    return response.count or 0


def get_notification(access_token: str, notification_id: str) -> dict | None:
    # `notifications_select_own` RLS already means a stranger's lookup naturally returns
    # nothing here — this repository call inherits that, it doesn't add its own filter.
    response = (
        get_user_scoped_client(access_token)
        .table("notifications")
        .select("*")
        .eq("id", notification_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def mark_read(access_token: str, notification_id: str) -> None:
    get_user_scoped_client(access_token).table("notifications").update({"read": True}).eq(
        "id", notification_id
    ).execute()


def mark_all_read(access_token: str, user_id: str) -> None:
    get_user_scoped_client(access_token).table("notifications").update({"read": True}).eq(
        "user_id", user_id
    ).eq("read", False).execute()
