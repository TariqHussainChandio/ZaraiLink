from postgrest.exceptions import APIError

from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import messaging_repository as repo
from .audit_log_service import log_admin_action


def fetch_conversations(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_conversations(user.access_token, user.id)


def fetch_messages(user: AuthenticatedUser, conversation_id: str) -> list[dict]:
    return repo.fetch_messages(user.access_token, conversation_id)


def send_message(user: AuthenticatedUser, conversation_id: str, body: str, attachments: list[str]) -> dict:
    return repo.send_message(user.access_token, conversation_id, user.id, body, attachments)


def find_or_create_conversation(user: AuthenticatedUser, other_user_id: str) -> dict:
    existing = repo.find_conversation(user.access_token, user.id, other_user_id)
    if existing:
        return existing

    try:
        return repo.create_conversation(user.access_token, user.id, other_user_id)
    except APIError as exc:
        if exc.code == "23505":  # unique-index race: someone else created the same pair first
            return find_or_create_conversation(user, other_user_id)
        raise


def fetch_message_by_id(user: AuthenticatedUser, message_id: str) -> dict:
    message = repo.fetch_message_by_id(user.access_token, message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return message


def redact_message(user: AuthenticatedUser, message_id: str) -> None:
    repo.redact_message(user.access_token, message_id)
    log_admin_action(user, "redact_message", "messages", message_id)


def mark_conversation_read(user: AuthenticatedUser, conversation_id: str) -> None:
    repo.mark_conversation_read(user.access_token, conversation_id, user.id)
