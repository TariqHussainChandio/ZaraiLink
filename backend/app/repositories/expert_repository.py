from datetime import datetime, timezone
from typing import Any

from ..core.supabase_client import get_public_client, get_user_scoped_client

EXPERT_SELECT = "*, profile:profiles(id,full_name,avatar_url), expert_specializations(specialization)"
EXPERT_ADMIN_SELECT = (
    "*, profile:profiles(id,full_name,avatar_url), expert_specializations(specialization), "
    "expert_verifications(id,document_url,decision,decision_at,notes,created_at)"
)


def _replace_specializations(access_token: str, expert_id: str, specializations: list[str]) -> None:
    client = get_user_scoped_client(access_token)
    client.table("expert_specializations").delete().eq("expert_id", expert_id).execute()
    if specializations:
        client.table("expert_specializations").insert(
            [{"expert_id": expert_id, "specialization": s} for s in specializations]
        ).execute()


def submit_application(
    access_token: str, expert_id: str, fields: dict[str, Any], specializations: list[str], document_path: str | None
) -> dict:
    client = get_user_scoped_client(access_token)
    response = client.table("experts").insert({"id": expert_id, **fields}).select().single().execute()
    _replace_specializations(access_token, expert_id, specializations)
    client.table("expert_verifications").insert({"expert_id": expert_id, "document_url": document_path}).execute()
    return response.data


def update_profile(access_token: str, expert_id: str, fields: dict[str, Any], specializations: list[str]) -> dict:
    client = get_user_scoped_client(access_token)
    response = (
        client.table("experts").update(fields).eq("id", expert_id).select().single().execute()
    )
    _replace_specializations(access_token, expert_id, specializations)
    return response.data


def fetch_expert_profile(expert_id: str) -> dict | None:
    response = get_public_client().table("experts").select(EXPERT_SELECT).eq("id", expert_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def fetch_expert_by_id(expert_id: str) -> dict | None:
    return fetch_expert_profile(expert_id)


def fetch_specialization_matches(specialization: str) -> list[str]:
    response = (
        get_public_client()
        .table("expert_specializations")
        .select("expert_id")
        .eq("specialization", specialization)
        .execute()
    )
    return [row["expert_id"] for row in response.data or []]


def fetch_experts(expert_ids: list[str] | None) -> list[dict]:
    query = get_public_client().table("experts").select(EXPERT_SELECT).eq("verification_status", "approved")
    if expert_ids is not None:
        query = query.in_("id", expert_ids)
    return query.order("created_at", desc=True).execute().data or []


def fetch_experts_for_admin(access_token: str, status: str | None) -> list[dict]:
    query = get_user_scoped_client(access_token).table("experts").select(EXPERT_ADMIN_SELECT)
    if status:
        query = query.eq("verification_status", status)
    return query.order("created_at", desc=True).execute().data or []


def fetch_expert_for_admin_by_id(access_token: str, expert_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("experts")
        .select(EXPERT_ADMIN_SELECT)
        .eq("id", expert_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def review_verification(
    access_token: str, expert_id: str, verification_id: str, decision: str, notes: str | None, reviewed_by: str
) -> None:
    client = get_user_scoped_client(access_token)
    client.table("experts").update({"verification_status": decision}).eq("id", expert_id).execute()
    client.table("expert_verifications").update(
        {
            "decision": decision,
            "reviewed_by": reviewed_by,
            "decision_at": datetime.now(timezone.utc).isoformat(),
            "notes": notes,
        }
    ).eq("id", verification_id).execute()


def create_document_signed_url(access_token: str, path: str) -> str | None:
    response = get_user_scoped_client(access_token).storage.from_("expert-documents").create_signed_url(
        path, 3600
    )
    return response.get("signedUrl") or response.get("signedURL")
