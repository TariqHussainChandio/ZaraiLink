from datetime import datetime, timezone

from ..core.supabase_client import get_user_scoped_client

REPORT_SELECT = "*, reporter:profiles!reports_reporter_id_fkey(id,full_name)"
AUDIT_LOG_SELECT = "*, actor:profiles!audit_logs_actor_id_fkey(id,full_name)"
AUDIT_LOG_LIMIT = 200


def fetch_role_counts(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("profiles").select("role").execute().data or []


def count_listings(access_token: str) -> int:
    response = get_user_scoped_client(access_token).table("listings").select("*", count="exact", head=True).execute()
    return response.count or 0


def count_orders(access_token: str) -> int:
    response = get_user_scoped_client(access_token).table("orders").select("*", count="exact", head=True).execute()
    return response.count or 0


def fetch_all_profiles(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("profiles").select("*").order("full_name").execute().data or []


def fetch_profile_role(access_token: str, profile_id: str) -> str | None:
    response = (
        get_user_scoped_client(access_token).table("profiles").select("role").eq("id", profile_id).limit(1).execute()
    )
    rows = response.data or []
    return rows[0]["role"] if rows else None


def set_profile_suspended(access_token: str, profile_id: str, is_suspended: bool) -> None:
    get_user_scoped_client(access_token).table("profiles").update({"is_suspended": is_suspended}).eq(
        "id", profile_id
    ).execute()


def update_profile_role(access_token: str, profile_id: str, new_role: str) -> None:
    get_user_scoped_client(access_token).table("profiles").update({"role": new_role}).eq("id", profile_id).execute()


def fetch_reports(access_token: str, status: str | None) -> list[dict]:
    query = get_user_scoped_client(access_token).table("reports").select(REPORT_SELECT).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    return query.execute().data or []


def resolve_report(access_token: str, report_id: str, status: str, resolved_by: str, notes: str | None) -> None:
    get_user_scoped_client(access_token).table("reports").update(
        {
            "status": status,
            "resolution_notes": notes,
            "resolved_by": resolved_by,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", report_id).execute()


def fetch_audit_logs(access_token: str, target_entity: str | None, actor_id: str | None) -> list[dict]:
    query = (
        get_user_scoped_client(access_token)
        .table("audit_logs")
        .select(AUDIT_LOG_SELECT)
        .order("created_at", desc=True)
        .limit(AUDIT_LOG_LIMIT)
    )
    if target_entity:
        query = query.eq("target_entity", target_entity)
    if actor_id:
        query = query.eq("actor_id", actor_id)
    return query.execute().data or []
