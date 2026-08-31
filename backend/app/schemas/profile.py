from pydantic import BaseModel


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    avatar_url: str | None = None
    country: str | None = None
    province: str | None = None
    city: str | None = None
    village: str | None = None
    street: str | None = None
    notifications_enabled: bool | None = None
