from datetime import UTC, datetime

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row
from app.database.supabase_client import get_user_scoped_client

# Both hops read profiles_public (20260923080100_profiles_public_view.sql), not profiles
# directly — profiles' own RLS only lets a caller see their own row, so a participant could never
# see the OTHER participant's name/avatar otherwise.
CONVERSATION_SELECT = (
    "*, "
    "participant_one_profile:profiles_public!conversations_participant_one_fkey(id,full_name,avatar_url), "
    "participant_two_profile:profiles_public!conversations_participant_two_fkey(id,full_name,avatar_url)"
)


async def fetch_conversations(access_token: str, user_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    conversations_response = await (
        client.table("conversations")
        .select(CONVERSATION_SELECT)
        .or_(f"participant_one.eq.{user_id},participant_two.eq.{user_id}")
        .range(*page_range())
        .execute()
    )
    conversations = as_rows(conversations_response)
    if not conversations:
        return []

    conversation_ids = [c["id"] for c in conversations]
    messages_response = await (
        client.table("messages")
        .select("*")
        .in_("conversation_id", conversation_ids)
        .order("created_at", desc=True)
        .execute()
    )
    messages = as_rows(messages_response)

    last_by_conversation: dict[str, dict] = {}
    for message in messages:
        last_by_conversation.setdefault(message["conversation_id"], message)

    with_preview = []
    for conversation in conversations:
        other = (
            conversation["participant_two_profile"]
            if conversation["participant_one"] == user_id
            else conversation["participant_one_profile"]
        )
        with_preview.append(
            {
                **conversation,
                "otherParticipant": other,
                "lastMessage": last_by_conversation.get(conversation["id"]),
            }
        )

    def sort_key(c: dict) -> str:
        last = c["lastMessage"]
        return last["created_at"] if last else c["created_at"]

    return sorted(with_preview, key=sort_key, reverse=True)


async def fetch_messages(access_token: str, conversation_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


async def send_message(
    access_token: str, conversation_id: str, sender_id: str, body: str, attachments: list[str]
) -> dict:
    # RLS (`messages_insert_participant`) already enforces sender_id = auth.uid() AND that the
    # caller is one of the conversation's two participants — using the user-scoped client here
    # means a non-participant's insert is rejected at the database, not just skipped client-side.
    # N1 fix: insert() has no .select() on the pinned postgrest-py client — the write's own
    # returning=representation default already includes the full row.
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("messages")
        .insert({"conversation_id": conversation_id, "sender_id": sender_id, "body": body, "attachments": attachments})
        .execute()
    )
    return first_row(response)


async def find_conversation(access_token: str, user_id: str, other_user_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("conversations")
        .select("*")
        .or_(
            f"and(participant_one.eq.{user_id},participant_two.eq.{other_user_id}),"
            f"and(participant_one.eq.{other_user_id},participant_two.eq.{user_id})"
        )
        .execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def create_conversation(
    access_token: str, user_id: str, other_user_id: str, context_type: str, context_id: str
) -> dict:
    # N1 fix — see send_message's comment above.
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("conversations")
        .insert(
            {
                "participant_one": user_id,
                "participant_two": other_user_id,
                "context_type": context_type,
                "context_id": context_id,
            }
        )
        .execute()
    )
    return first_row(response)


async def fetch_message_by_id(access_token: str, message_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("messages").select("*").eq("id", message_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


async def redact_message(access_token: str, message_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("messages").update({"body": "[removed by moderator]"}).eq("id", message_id).execute()


async def mark_conversation_read(access_token: str, conversation_id: str, user_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await (
        client.table("messages")
        .update({"read_at": datetime.now(UTC).isoformat()})
        .eq("conversation_id", conversation_id)
        .neq("sender_id", user_id)
        .is_("read_at", None)
        .execute()
    )
