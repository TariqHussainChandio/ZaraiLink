"""Response models for currencies and measurement units."""

from pydantic import BaseModel


# A currency: code, symbol and name.
class Currency(BaseModel):
    id: str
    code: str
    symbol: str
    name: str


# A measurement unit: code, label and what it applies to.
class Unit(BaseModel):
    id: str
    code: str
    label: str
    applies_to: str | None = None
