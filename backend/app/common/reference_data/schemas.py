from pydantic import BaseModel


class Currency(BaseModel):
    id: str
    code: str
    symbol: str
    name: str


class Unit(BaseModel):
    id: str
    code: str
    label: str
    applies_to: str | None = None
