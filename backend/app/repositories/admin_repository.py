from datetime import UTC, datetime

from postgrest.types import CountMethod

from ..core.pagination import page_range
from ..core.rows import as_rows
from ..core.supabase_client import get_user_scoped_client

REPORT_SELECT = "*, reporter:profiles!reports_reporter_id_fkey(id,full_name)"
AUDIT_LOG_SELECT = "*, actor:profiles!audit_logs_actor_id_fkey(id,full_name)"


async def fetch_role_counts(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("profiles").select("role").execute()
    return as_rows(response)


async def count_listings(access_token: str) -> int:
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").select("*", count=CountMethod.exact, head=True).execute()
    return response.count or 0


async def count_orders(access_token: str) -> int:
    client = await get_user_scoped_client(access_token)
    response = await client.table("orders").select("*", count=CountMethod.exact, head=True).execute()
    return response.count or 0


async def fetch_all_profiles(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("profiles").select("*").order("full_name").range(*page_range()).execute()
    return as_rows(response)


async def fetch_profile_role(access_token: str, profile_id: str) -> str | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("profiles").select("role").eq("id", profile_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0]["role"] if rows else None


async def set_profile_suspended(access_token: str, profile_id: str, is_suspended: bool) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("profiles").update({"is_suspended": is_suspended}).eq("id", profile_id).execute()


async def update_profile_role(access_token: str, profile_id: str, new_role: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("profiles").update({"role": new_role}).eq("id", profile_id).execute()


async def fetch_reports(access_token: str, status: str | None) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("reports").select(REPORT_SELECT).order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    response = await query.range(*page_range()).execute()
    return as_rows(response)


async def resolve_report(access_token: str, report_id: str, status: str, resolved_by: str, notes: str | None) -> None:
    client = await get_user_scoped_client(access_token)
    await (
        client.table("reports")
        .update(
            {
                "status": status,
                "resolution_notes": notes,
                "resolved_by": resolved_by,
                "resolved_at": datetime.now(UTC).isoformat(),
            }
        )
        .eq("id", report_id)
        .execute()
    )


async def fetch_audit_logs(access_token: str, target_entity: str | None, actor_id: str | None) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("audit_logs").select(AUDIT_LOG_SELECT).order("created_at", desc=True)
    if target_entity:
        query = query.eq("target_entity", target_entity)
    if actor_id:
        query = query.eq("actor_id", actor_id)
    response = await query.range(*page_range()).execute()
    return as_rows(response)
