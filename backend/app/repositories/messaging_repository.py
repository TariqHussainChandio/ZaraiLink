from datetime import datetime, timezone

from ..core.supabase_client import get_user_scoped_client

CONVERSATION_SELECT = (
    "*, "
    "participant_one_profile:profiles!conversations_participant_one_fkey(id,full_name,avatar_url), "
    "participant_two_profile:profiles!conversations_participant_two_fkey(id,full_name,avatar_url)"
)


def fetch_conversations(access_token: str, user_id: str) -> list[dict]:
    client = get_user_scoped_client(access_token)
    conversations = (
        client.table("conversations")
        .select(CONVERSATION_SELECT)
        .or_(f"participant_one.eq.{user_id},participant_two.eq.{user_id}")
        .execute()
        .data
        or []
    )
    if not conversations:
        return []

    conversation_ids = [c["id"] for c in conversations]
    messages = (
        client.table("messages")
        .select("*")
        .in_("conversation_id", conversation_ids)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )

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


def fetch_messages(access_token: str, conversation_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
        .data
        or []
    )


def send_message(access_token: str, conversation_id: str, sender_id: str, body: str, attachments: list[str]) -> dict:
    # RLS (`messages_insert_participant`) already enforces sender_id = auth.uid() AND that the
    # caller is one of the conversation's two participants — using the user-scoped client here
    # means a non-participant's insert is rejected at the database, not just skipped client-side.
    response = (
        get_user_scoped_client(access_token)
        .table("messages")
        .insert({"conversation_id": conversation_id, "sender_id": sender_id, "body": body, "attachments": attachments})
        .select()
        .single()
        .execute()
    )
    return response.data


def find_conversation(access_token: str, user_id: str, other_user_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("conversations")
        .select("*")
        .or_(
            f"and(participant_one.eq.{user_id},participant_two.eq.{other_user_id}),"
            f"and(participant_one.eq.{other_user_id},participant_two.eq.{user_id})"
        )
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def create_conversation(access_token: str, user_id: str, other_user_id: str) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("conversations")
        .insert({"participant_one": user_id, "participant_two": other_user_id})
        .select()
        .single()
        .execute()
    )
    return response.data


def fetch_message_by_id(access_token: str, message_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token).table("messages").select("*").eq("id", message_id).limit(1).execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def redact_message(access_token: str, message_id: str) -> None:
    get_user_scoped_client(access_token).table("messages").update({"body": "[removed by moderator]"}).eq(
        "id", message_id
    ).execute()


def mark_conversation_read(access_token: str, conversation_id: str, user_id: str) -> None:
    get_user_scoped_client(access_token).table("messages").update(
        {"read_at": datetime.now(timezone.utc).isoformat()}
    ).eq("conversation_id", conversation_id).neq("sender_id", user_id).is_("read_at", None).execute()
