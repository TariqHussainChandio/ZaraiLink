from pydantic import BaseModel


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    avatar_url: str | None = None
    country_id: str | None = None
    province_id: str | None = None
    city_id: str | None = None
    village: str | None = None
    street: str | None = None
