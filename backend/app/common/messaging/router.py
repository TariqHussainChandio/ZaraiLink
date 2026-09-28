from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_admin_aal2, require_authenticated_user
from app.common.messaging import service
from app.common.messaging.schemas import (
    Conversation,
    ConversationWithPreview,
    FindOrCreateConversationRequest,
    Message,
    SendMessageRequest,
)
from app.common.pagination import Page, paginate

router = APIRouter(prefix="/api/v1/messaging", tags=["messaging"])


@router.get("/conversations", response_model=list[ConversationWithPreview])
async def list_conversations(
    user: AuthenticatedUser = Depends(require_authenticated_user), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_conversations(user))


@router.post("/conversations", response_model=Conversation)
async def find_or_create_conversation(
    request: FindOrCreateConversationRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return await service.find_or_create_conversation(user, request.other_user_id)


@router.get("/conversations/{conversation_id}/messages", response_model=list[Message])
async def list_messages(
    conversation_id: str,
    user: AuthenticatedUser = Depends(require_authenticated_user),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_messages(user, conversation_id))


@router.post("/conversations/{conversation_id}/messages", response_model=Message)
async def send_message(
    conversation_id: str,
    request: SendMessageRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return await service.send_message(user, conversation_id, request.body, request.attachments)


@router.patch("/conversations/{conversation_id}/read", status_code=204)
async def mark_conversation_read(
    conversation_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> None:
    await service.mark_conversation_read(user, conversation_id)


@router.get("/messages/{message_id}", response_model=Message)
async def get_message(message_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return await service.fetch_message_by_id(user, message_id)


@router.patch("/messages/{message_id}/redact", status_code=204)
async def redact_message(message_id: str, user: AuthenticatedUser = Depends(require_admin_aal2)) -> None:
    await service.redact_message(user, message_id)
