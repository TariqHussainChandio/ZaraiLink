from typing import Any

from postgrest.exceptions import APIError

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_public_client, get_user_scoped_client

# profiles_public (20260923080100_profiles_public_view.sql), not profiles directly — profiles'
# own RLS only lets a caller see their own row, so a buyer browsing the expert directory could
# never see any expert's name otherwise.
EXPERT_SELECT = "*, profile:profiles_public(id,full_name,avatar_url), expert_specializations(specialization)"
EXPERT_ADMIN_SELECT = (
    "*, profile:profiles!inner(id,full_name,avatar_url,phone,account_status,account_status_reason,"
    "application_submitted_at), expert_specializations(specialization), "
    "expert_verifications(id,document_url,decision,decision_at,notes,created_at), "
    "expert_documents(id,required_document_id,file_name,mime_type,size_bytes,created_at,"
    "required_document:required_documents(id,code,label))"
)


async def _replace_specializations(access_token: str, expert_id: str, specializations: list[str]) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("expert_specializations").delete().eq("expert_id", expert_id).execute()
    if specializations:
        await (
            client.table("expert_specializations")
            .insert([{"expert_id": expert_id, "specialization": s} for s in specializations])
            .execute()
        )


async def create_application(
    access_token: str, expert_id: str, fields: dict[str, Any], specializations: list[str]
) -> dict | None:
    """The expert's draft: the professional details and specializations. Since A3b the submission record is written by
    submit_application() in the database when the expert submits, not here."""
    # N1 fix: insert() has no .select() on the pinned postgrest-py client — the write's own
    # returning=representation default already includes the full row.
    client = await get_user_scoped_client(access_token)
    try:
        response = await client.table("experts").insert({"id": expert_id, **fields}).execute()
    except APIError as exc:
        if exc.code == "42501":
            return None
        raise
    await _replace_specializations(access_token, expert_id, specializations)
    return first_row(response)


async def update_profile(
    access_token: str, expert_id: str, fields: dict[str, Any], specializations: list[str]
) -> dict | None:
    """The expert's details; None when the policies matched no row, which for the expert's own row means the
    application is frozen under review (A3b). Nothing else is written then."""
    client = await get_user_scoped_client(access_token)
    response = await client.table("experts").update(fields).eq("id", expert_id).execute()
    if not as_rows(response):
        return None
    await _replace_specializations(access_token, expert_id, specializations)
    return first_row(response)


async def fetch_expert_profile(expert_id: str) -> dict | None:
    response = await get_public_client().table("experts").select(EXPERT_SELECT).eq("id", expert_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_own_expert_profile(access_token: str, expert_id: str) -> dict | None:
    """The caller's own expert row, whatever its verification status.

    Read with the caller's token, not the anonymous client: RLS shows an anonymous reader only `approved` experts,
    so the public read made an expert who had applied (status `pending` or `rejected`) look as if they had never
    applied. The app then showed "complete your profile" again and offered a second application.
    """
    client = await get_user_scoped_client(access_token)
    response = await client.table("experts").select(EXPERT_SELECT).eq("id", expert_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_expert_by_id(expert_id: str) -> dict | None:
    return await fetch_expert_profile(expert_id)


async def fetch_specialization_matches(specialization: str) -> list[str]:
    response = await (
        get_public_client()
        .table("expert_specializations")
        .select("expert_id")
        .eq("specialization", specialization)
        .execute()
    )
    return [row["expert_id"] for row in as_rows(response)]


async def fetch_experts(expert_ids: list[str] | None) -> list[dict]:
    query = get_public_client().table("experts").select(EXPERT_SELECT).eq("verification_status", "approved")
    if expert_ids is not None:
        query = query.in_("id", expert_ids)
    response = await query.order("created_at", desc=True).range(*page_range()).execute()
    return as_rows(response)


async def fetch_experts_for_admin(access_token: str, status: str | None) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("experts").select(EXPERT_ADMIN_SELECT)
    if status:
        query = query.eq("verification_status", status)
    if status == "pending":
        # The queue holds submitted applications only; a draft is still being written (A3b).
        query = query.not_.is_("profile.application_submitted_at", "null")
    response = await query.order("created_at", desc=True).range(*page_range()).execute()
    return as_rows(response)


async def fetch_expert_for_admin_by_id(access_token: str, expert_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("experts").select(EXPERT_ADMIN_SELECT).eq("id", expert_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_profile_role(access_token: str, profile_id: str) -> str | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("profiles").select("role").eq("id", profile_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0]["role"] if rows else None
