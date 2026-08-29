from pydantic import BaseModel


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
    participant_one_profile: ParticipantProfile | None = None
    participant_two_profile: ParticipantProfile | None = None


class ConversationWithPreview(Conversation):
    otherParticipant: ParticipantProfile | None = None
    lastMessage: Message | None = None


class SendMessageRequest(BaseModel):
    body: str
    attachments: list[str] = []


class FindOrCreateConversationRequest(BaseModel):
    other_user_id: str
