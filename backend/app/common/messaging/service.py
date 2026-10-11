from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
from app.common.messaging import repository as repo


async def fetch_conversations(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_conversations(user.access_token, user.id)


async def fetch_messages(user: AuthenticatedUser, conversation_id: str) -> list[dict]:
    return await repo.fetch_messages(user.access_token, conversation_id)


async def send_message(user: AuthenticatedUser, conversation_id: str, body: str, attachments: list[str]) -> dict:
    # RLS (`messages_insert_participant`, see repo.send_message's comment) rejects a
    # non-participant's insert at the database as a 42501 (insufficient_privilege), which
    # postgrest-py raises as an APIError — left uncaught, that's an unhandled exception, so
    # FastAPI's default handler turns it into a 500 instead of the 403 a non-participant should
    # see. Found by the real-stack smoke matrix (P5a), which is the first test to call this as a
    # genuine non-participant rather than mocking the repository layer.
    try:
        return await repo.send_message(user.access_token, conversation_id, user.id, body, attachments)
    except APIError as exc:
        if exc.code == "42501":
            raise HTTPException(status_code=403, detail="You are not a participant in this conversation.") from exc
        raise


async def find_or_create_conversation(
    user: AuthenticatedUser, other_user_id: str, context_type: str, context_id: str
) -> dict:
    # One conversation per pair: an existing thread is reused whatever started it, so a pair that already talks can
    # keep talking. A new one needs a relationship, which `conversations_insert_related` checks at the database
    # (A5, SRDS §30); an unrelated pair is refused there as a 42501.
    existing = await repo.find_conversation(user.access_token, user.id, other_user_id)
    if existing:
        return existing

    try:
        return await repo.create_conversation(user.access_token, user.id, other_user_id, context_type, context_id)
    except APIError as exc:
        if exc.code == "23505":  # unique-index race: someone else created the same pair first
            return await find_or_create_conversation(user, other_user_id, context_type, context_id)
        if exc.code == "42501":
            raise HTTPException(
                status_code=403, detail="You can message someone only about a listing, order or consultation you share."
            ) from exc
        raise


async def fetch_message_by_id(user: AuthenticatedUser, message_id: str) -> dict:
    message = await repo.fetch_message_by_id(user.access_token, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return message


async def redact_message(user: AuthenticatedUser, message_id: str) -> None:
    await repo.redact_message(user.access_token, message_id)
    await log_admin_action(user, "message_redacted", "messages", message_id)


async def mark_conversation_read(user: AuthenticatedUser, conversation_id: str) -> None:
    await repo.mark_conversation_read(user.access_token, conversation_id, user.id)
