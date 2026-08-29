from typing import Literal

from pydantic import BaseModel

ListingStatus = Literal["active", "inactive", "sold"]


class CategoryInput(BaseModel):
    name: str
    slug: str
    icon: str | None = None


class CategoryUpdateInput(BaseModel):
    name: str | None = None
    slug: str | None = None
    icon: str | None = None


class ListingInput(BaseModel):
    title: str
    description: str | None = None
    category_id: str | None = None
    price: float
    unit: str
    quantity: float
    images: list[str] = []
    brand: str | None = None
    condition: str | None = None
    crop_compatibility: list[str] = []
    country_id: str | None = None
    province_id: str | None = None
    city_id: str | None = None


class ListingUpdateInput(BaseModel):
    title: str | None = None
    description: str | None = None
    category_id: str | None = None
    price: float | None = None
    unit: str | None = None
    quantity: float | None = None
    images: list[str] | None = None
    brand: str | None = None
    condition: str | None = None
    crop_compatibility: list[str] | None = None
    country_id: str | None = None
    province_id: str | None = None
    city_id: str | None = None


class UpdateListingStatusRequest(BaseModel):
    status: ListingStatus


class ViewCountsRequest(BaseModel):
    listing_ids: list[str]
