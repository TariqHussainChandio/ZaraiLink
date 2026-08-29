from pydantic import BaseModel


class Country(BaseModel):
    id: str
    name: str
    iso_code: str


class Province(BaseModel):
    id: str
    country_id: str
    name: str


class City(BaseModel):
    id: str
    province_id: str
    name: str


class PhoneCode(BaseModel):
    id: str
    country_id: str
    calling_code: str


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
