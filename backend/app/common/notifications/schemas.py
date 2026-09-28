from typing import Any

from pydantic import BaseModel


class Notification(BaseModel):
    id: str
    user_id: str
    type: str
    payload: dict[str, Any]
    read: bool
    created_at: str


class UnreadCountResponse(BaseModel):
    count: int
