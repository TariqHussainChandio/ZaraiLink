"""Request and response models for the messaging routes."""

from typing import Literal
from uuid import UUID

from pydantic import BaseModel

# SRDS §30 (A5): a conversation starts from a listing, an order or a consultation.
ConversationContextType = Literal["listing", "order", "consultation"]


# The other person's public name and photo.
class ParticipantProfile(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


# One chat message.
class Message(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    body: str
    attachments: list[str]
    read_at: str | None = None
    created_at: str


# A conversation between two users.
class Conversation(BaseModel):
    id: str
    participant_one: str
    participant_two: str
    created_at: str
    context_type: ConversationContextType | None = None
    context_id: str | None = None
    participant_one_profile: ParticipantProfile | None = None
    participant_two_profile: ParticipantProfile | None = None


# A conversation plus the other person and the last message, for the inbox.
class ConversationWithPreview(Conversation):
    otherParticipant: ParticipantProfile | None = None
    lastMessage: Message | None = None


# Body for sending a message: text and photo storage paths.
class SendMessageRequest(BaseModel):
    body: str
    attachments: list[str] = []


# Body for opening a chat with another user about a listing, order or consultation.
class FindOrCreateConversationRequest(BaseModel):
    # UUIDs, not free strings: other_user_id is interpolated into a PostgREST or_() filter, and a malformed context_id
    # must be refused even when the pair already has a conversation (A5 verifier).
    other_user_id: UUID
    context_type: ConversationContextType
    context_id: UUID
