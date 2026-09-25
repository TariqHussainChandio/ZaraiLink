from typing import Any

from ..core.pagination import page_range
from ..core.rows import as_rows, first_row
from ..core.supabase_client import get_user_scoped_client

# Security/correctness fix N2 (standardization plan, P0 baseline / P5a "Backend repair"):
# `consultations.expert_id` references `experts(id)`, not `profiles(id)` directly (Postgres
# constraint `consultations_expert_id_fkey`) — deliberately, so a consultation can only ever be
# assigned to a real registered expert, not any profile. The old single-hop embed
# `profiles!consultations_expert_id_fkey(...)` asked PostgREST to reach `profiles` through a FK
# that doesn't point there, which PostgREST can't resolve (PGRST200) — confirmed as the exact
# cause of 4 crashing read routes in the P0 baseline. Retargeting the FK to `profiles` directly
# would fix the query but weaken that integrity guarantee, so the fix instead follows the real
# two-hop chain (`consultations -> experts -> profiles`, via `experts`' own `experts_id_fkey` to
# `profiles`) and _flatten_expert() below collapses the extra nesting back to the original flat
# shape every caller already expects. Both hops read `profiles_public`, not `profiles` directly —
# `profiles` only lets a caller see their own row (`profiles_select_own_or_admin`), so a farmer
# viewing this consultation could never see the expert's name at all otherwise; `profiles_public`
# (20260923080100_profiles_public_view.sql) exposes exactly id/full_name/avatar_url broadly.
CONSULTATION_SELECT = (
    "*, user:profiles_public!consultations_user_id_fkey(id,full_name,avatar_url), "
    "expert:experts!consultations_expert_id_fkey(profile:profiles_public!experts_id_fkey(id,full_name,avatar_url)), "
    "crop:crops(id,name)"
)
MESSAGE_SELECT = "*, recommended_listing:listings(id,title,price,unit)"


def _flatten_expert(row: dict) -> dict:
    """Collapses the two-hop `expert: {profile: {...}}` embed (see CONSULTATION_SELECT's
    comment) back into the flat `expert: {...}` shape every caller downstream — service layer,
    Pydantic response models, the frontend — already expects. `expert_id` is nullable, so the
    embed can legitimately be None."""
    expert = row.get("expert")
    row["expert"] = expert["profile"] if expert else None
    return row


async def create_request(access_token: str, user_id: str, fields: dict[str, Any]) -> dict:
    # No embed needed here — the create endpoint's response_model is the plain `Consultation`,
    # not `ConsultationWithRelations` (see api/v1/endpoints/consultations.py), so the write-then-
    # select fix (N1) is the plain default: insert alone already returns the full row.
    client = await get_user_scoped_client(access_token)
    response = await client.table("consultations").insert({"user_id": user_id, **fields}).execute()
    return first_row(response)


async def update_images(access_token: str, consultation_id: str, images: list[str]) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("consultations").update({"images": images}).eq("id", consultation_id).execute()


async def fetch_for_user(access_token: str, user_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("consultations")
        .select(CONSULTATION_SELECT)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    rows = as_rows(response)
    return [_flatten_expert(row) for row in rows]


async def fetch_for_expert(access_token: str, expert_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("consultations")
        .select(CONSULTATION_SELECT)
        .eq("expert_id", expert_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    rows = as_rows(response)
    return [_flatten_expert(row) for row in rows]


async def get_by_id(access_token: str, consultation_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("consultations").select(CONSULTATION_SELECT).eq("id", consultation_id).limit(1).execute()
    )
    rows = as_rows(response)
    return _flatten_expert(rows[0]) if rows else None


async def update_status(access_token: str, consultation_id: str, status: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("consultations").update({"status": status}).eq("id", consultation_id).execute()


async def fetch_messages(access_token: str, consultation_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("consultation_messages")
        .select(MESSAGE_SELECT)
        .eq("consultation_id", consultation_id)
        .order("created_at", desc=False)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def send_message(
    access_token: str,
    consultation_id: str,
    sender_id: str,
    body: str,
    attachments: list[str],
    recommended_listing_id: str | None,
) -> dict:
    # N1 fix: insert() has no .select() (see CONSULTATION_SELECT's comment on the pinned
    # postgrest-py client). The endpoint's response_model needs the embedded
    # `recommended_listing`, so a plain insert followed by a second, embedded read — two round
    # trips, but correct.
    client = await get_user_scoped_client(access_token)
    insert_response = (
        await client.table("consultation_messages")
        .insert(
            {
                "consultation_id": consultation_id,
                "sender_id": sender_id,
                "body": body,
                "attachments": attachments,
                "recommended_listing_id": recommended_listing_id,
            }
        )
        .execute()
    )
    inserted = first_row(insert_response)
    response = await (
        client.table("consultation_messages").select(MESSAGE_SELECT).eq("id", inserted["id"]).limit(1).execute()
    )
    return first_row(response)
