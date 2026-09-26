from pydantic import BaseModel


class Location(BaseModel):
    """The structured place stored as jsonb on farms, stores, listings and experts."""

    city: str | None = None
    province: str | None = None
    country: str | None = None
