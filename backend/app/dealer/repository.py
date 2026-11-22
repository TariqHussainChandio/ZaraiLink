from typing import Any

from postgrest.exceptions import APIError

from app.common.errors import AppHTTPException
from app.common.pagination import page_range
from app.common.rows import as_rows
from app.database.supabase_client import get_user_scoped_client

# --- the listing picker (the legacy inventory screens; the inventory itself is read through the IMS service) ---------


async def fetch_dealer_listings(access_token: str, dealer_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("listings")
        .select("id,title")
        .eq("owner_id", dealer_id)
        .order("title")
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


# --- the dealer application (A3b) -----------------------------------------------------------------------------------

APPLICATION_FOR_ADMIN_SELECT = (
    "id,full_name,phone,account_status,account_status_reason,application_submitted_at,created_at,"
    "dealer_profile:dealer_profiles(*),"
    "dealer_documents(id,required_document_id,file_name,mime_type,size_bytes,created_at,"
    "required_document:required_documents(id,code,label))"
)


async def fetch_dealer_profile(access_token: str, dealer_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(await client.table("dealer_profiles").select("*").eq("id", dealer_id).limit(1).execute())
    return rows[0] if rows else None


async def save_dealer_profile(access_token: str, dealer_id: str, fields: dict[str, Any]) -> dict | None:
    """Creates or replaces the caller's business details; None when the policies refused (the application is locked).
    An insert the policies refuse raises 42501, an update they refuse matches no row; both mean the same here."""
    client = await get_user_scoped_client(access_token)
    try:
        response = await client.table("dealer_profiles").upsert({"id": dealer_id, **fields}).execute()
    except APIError as exc:
        if exc.code == "42501":
            return None
        raise
    rows = as_rows(response)
    return rows[0] if rows else None


async def fetch_applications_for_admin(access_token: str, status: str) -> list[dict]:
    # The queue lists submitted applications in the order they came in; a draft is not in it (SRDS §12).
    client = await get_user_scoped_client(access_token)
    query = (
        client.table("profiles").select(APPLICATION_FOR_ADMIN_SELECT).eq("role", "dealer").eq("account_status", status)
    )
    if status == "pending":
        query = query.not_.is_("application_submitted_at", "null")
    response = await query.order("application_submitted_at", nullsfirst=False).range(*page_range()).execute()
    return as_rows(response)


async def fetch_application_for_admin(access_token: str, dealer_id: str) -> dict:
    client = await get_user_scoped_client(access_token)
    rows = as_rows(
        await client.table("profiles")
        .select(APPLICATION_FOR_ADMIN_SELECT)
        .eq("id", dealer_id)
        .eq("role", "dealer")
        .limit(1)
        .execute()
    )
    if not rows:
        raise AppHTTPException(404, "No such dealer", "not_found")
    return rows[0]
