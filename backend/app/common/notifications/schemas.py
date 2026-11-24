"""Response models for the notification routes."""

from typing import Any

from pydantic import BaseModel


# One in-app notification; `payload` holds the event details.
class Notification(BaseModel):
    id: str
    user_id: str
    type: str
    payload: dict[str, Any]
    read: bool
    created_at: str


# The number of unread notifications.
class UnreadCountResponse(BaseModel):
    count: int
