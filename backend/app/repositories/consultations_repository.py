from typing import Any

from ..core.supabase_client import get_user_scoped_client

CONSULTATION_SELECT = (
    "*, user:profiles!consultations_user_id_fkey(id,full_name,avatar_url), "
    "expert:profiles!consultations_expert_id_fkey(id,full_name,avatar_url), crop:crops(id,name)"
)
MESSAGE_SELECT = "*, recommended_listing:listings(id,title,price,unit)"


def create_request(access_token: str, user_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("consultations")
        .insert({"user_id": user_id, **fields})
        .select()
        .single()
        .execute()
    )
    return response.data


def update_images(access_token: str, consultation_id: str, images: list[str]) -> None:
    get_user_scoped_client(access_token).table("consultations").update({"images": images}).eq(
        "id", consultation_id
    ).execute()


def fetch_for_user(access_token: str, user_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("consultations")
        .select(CONSULTATION_SELECT)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_for_expert(access_token: str, expert_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("consultations")
        .select(CONSULTATION_SELECT)
        .eq("expert_id", expert_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def get_by_id(access_token: str, consultation_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("consultations")
        .select(CONSULTATION_SELECT)
        .eq("id", consultation_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def update_status(access_token: str, consultation_id: str, status: str) -> None:
    get_user_scoped_client(access_token).table("consultations").update({"status": status}).eq(
        "id", consultation_id
    ).execute()


def fetch_messages(access_token: str, consultation_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("consultation_messages")
        .select(MESSAGE_SELECT)
        .eq("consultation_id", consultation_id)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )


def send_message(
    access_token: str,
    consultation_id: str,
    sender_id: str,
    body: str,
    attachments: list[str],
    recommended_listing_id: str | None,
) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("consultation_messages")
        .insert(
            {
                "consultation_id": consultation_id,
                "sender_id": sender_id,
                "body": body,
                "attachments": attachments,
                "recommended_listing_id": recommended_listing_id,
            }
        )
        .select(MESSAGE_SELECT)
        .single()
        .execute()
    )
    return response.data
