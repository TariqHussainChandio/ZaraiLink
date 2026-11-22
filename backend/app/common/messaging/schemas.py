from typing import Literal
from uuid import UUID

from pydantic import BaseModel

# SRDS §30 (A5): a conversation starts from a listing, an order or a consultation.
ConversationContextType = Literal["listing", "order", "consultation"]


class ParticipantProfile(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


class Message(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    body: str
    attachments: list[str]
    read_at: str | None = None
    created_at: str


class Conversation(BaseModel):
    id: str
    participant_one: str
    participant_two: str
    created_at: str
    context_type: ConversationContextType | None = None
    context_id: str | None = None
    participant_one_profile: ParticipantProfile | None = None
    participant_two_profile: ParticipantProfile | None = None


class ConversationWithPreview(Conversation):
    otherParticipant: ParticipantProfile | None = None
    lastMessage: Message | None = None


class SendMessageRequest(BaseModel):
    body: str
    attachments: list[str] = []


class FindOrCreateConversationRequest(BaseModel):
    # UUIDs, not free strings: other_user_id is interpolated into a PostgREST or_() filter, and a malformed context_id
    # must be refused even when the pair already has a conversation (A5 verifier).
    other_user_id: UUID
    context_type: ConversationContextType
    context_id: UUID
