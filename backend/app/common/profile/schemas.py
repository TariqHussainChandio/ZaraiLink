from pydantic import BaseModel


class DeleteAccountRequest(BaseModel):
    # Re-authentication (P4, 4A.5) — the current password, not the access token, proves the
    # caller really intends this. No new-value fields: this endpoint only ever deletes the
    # caller's own account, derived from their verified session, never a request-supplied id.
    password: str


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
