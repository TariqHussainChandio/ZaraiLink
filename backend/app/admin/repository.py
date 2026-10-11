from datetime import UTC, datetime

from postgrest.exceptions import APIError
from postgrest.types import CountMethod

from app.common.errors import AppHTTPException
from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_user_scoped_client

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


async def fetch_all_profiles(
    access_token: str, role: str | None = None, account_status: str | None = None
) -> list[dict]:
    # The filters run in the database, before the page is cut: the pending-dealer queue filtered one page of 100 in
    # the app and lost every applicant whose name sorted later (A3a verification, H2).
    client = await get_user_scoped_client(access_token)
    query = client.table("profiles").select("*")
    if role is not None:
        query = query.eq("role", role)
    if account_status is not None:
        query = query.eq("account_status", account_status)
    response = await query.order("full_name").range(*page_range()).execute()
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


async def fetch_audit_logs(
    access_token: str, target_entity: str | None, actor_id: str | None, action: str | None = None
) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    query = client.table("audit_logs").select(AUDIT_LOG_SELECT).order("created_at", desc=True)
    if target_entity:
        query = query.eq("target_entity", target_entity)
    if actor_id:
        query = query.eq("actor_id", actor_id)
    # Filtered in the database before the page is cut (audit_logs_action_idx), like the other filters.
    if action:
        query = query.eq("action", action)
    response = await query.range(*page_range()).execute()
    return as_rows(response)


async def fetch_audit_event_names(access_token: str) -> list[dict]:
    # The SRDS §51 vocabulary; its select policy is admin-only (audit_event_names_select_admin). A few dozen rows, so
    # no paging.
    client = await get_user_scoped_client(access_token)
    response = await client.table("audit_event_names").select("name, label").order("label").execute()
    return as_rows(response)


async def fetch_queue_counts(access_token: str) -> dict:
    # admin_queue_counts() returns a table of exactly one row; it raises 42501 for anyone but an admin.
    client = await get_user_scoped_client(access_token)
    response = await client.rpc("admin_queue_counts", {}).execute()
    rows = as_rows(response)
    if not rows:
        raise AppHTTPException(500, "The moderation queues could not be counted", "server_error")
    return rows[0]


# --- required documents (A3b). Every write is audited by the table's own trigger (audit_required_documents), so a
# write through the Data API is audited exactly like one through here; this code writes no audit row of its own.


async def fetch_required_documents(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("required_documents").select("*").order("role").order("sort_order").execute()
    return as_rows(response)


async def create_required_document(access_token: str, fields: dict) -> dict:
    client = await get_user_scoped_client(access_token)
    try:
        response = await client.table("required_documents").insert(fields).execute()
    except APIError as exc:
        if exc.code == "23505":
            raise AppHTTPException(409, "That code is already used for this role", "conflict") from exc
        raise
    return first_row(response)


async def update_required_document(access_token: str, document_id: str, fields: dict) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("required_documents").update(fields).eq("id", document_id).execute()
    return first_row(response)


# --- AI activity and the disease knowledge base (A6; SRDS §37). Every read below runs with the admin's own token, so
# row-level security decides what is visible: disease_cases, disease_predictions and consultations each have an
# is_admin() branch on their select policy, and disease_knowledge is readable by any signed-in user. None of these
# tables is dealer inventory (SRDS §15).

# PostgREST caps one response at max_rows (1000, supabase/config.toml); the activity window can hold more scans than
# that, so it is read in pages of this size until a short page comes back.
_ACTIVITY_PAGE = 1000

AI_CASE_SELECT = "id, created_at, status, disease_predictions(confidence_score)"


async def _fetch_all_since(
    access_token: str, table: str, select: str, since: str, extra_not_null: str | None = None
) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    rows: list[dict] = []
    start = 0
    while True:
        query = client.table(table).select(select).gte("created_at", since)
        if extra_not_null is not None:
            query = query.not_.is_(extra_not_null, "null")
        response = await query.order("created_at").order("id").range(start, start + _ACTIVITY_PAGE - 1).execute()
        page = as_rows(response)
        rows.extend(page)
        if len(page) < _ACTIVITY_PAGE:
            return rows
        start += _ACTIVITY_PAGE


async def fetch_disease_cases_since(access_token: str, since: str) -> list[dict]:
    return await _fetch_all_since(access_token, "disease_cases", AI_CASE_SELECT, since)


async def fetch_ai_referrals_since(access_token: str, since: str) -> list[dict]:
    # A consultation that carries a disease_case_id is a referral from an AI result to an expert (BR-13).
    return await _fetch_all_since(access_token, "consultations", "id, created_at", since, "disease_case_id")


async def fetch_disease_knowledge(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("disease_knowledge").select("*").order("crop").order("class_label").execute()
    return as_rows(response)


async def fetch_disease_knowledge_entry(access_token: str, class_label: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("disease_knowledge").select("*").eq("class_label", class_label).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def update_disease_knowledge(access_token: str, class_label: str, fields: dict) -> dict:
    # The update policy requires is_admin_aal2(): a token without a second factor matches no row, which first_row()
    # turns into a 404 rather than a silent success.
    client = await get_user_scoped_client(access_token)
    response = await client.table("disease_knowledge").update(fields).eq("class_label", class_label).execute()
    return first_row(response)
