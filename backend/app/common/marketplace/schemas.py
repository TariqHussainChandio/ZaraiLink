from typing import Literal

from pydantic import BaseModel

from app.common.schemas import Location

ListingStatus = Literal["active", "inactive", "sold"]
# The "Listing availability" contract (docs/plan.md §5): a word per listing, never the seller's stock figures.
# `unknown` when the answer could not be had (from B3, an IMS timeout), never an error.
Availability = Literal["in_stock", "low_stock", "out_of_stock", "unknown"]


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
    country: str | None = None
    province: str | None = None
    city: str | None = None


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
    country: str | None = None
    province: str | None = None
    city: str | None = None


class UpdateListingStatusRequest(BaseModel):
    status: ListingStatus


class ViewCountsRequest(BaseModel):
    listing_ids: list[str]


# ---- response models (P7 7A)


class Category(BaseModel):
    id: str
    name: str
    slug: str
    icon: str | None = None
    created_at: str


class CategoryRef(BaseModel):
    id: str
    name: str
    slug: str


class OwnerRef(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


class Crop(BaseModel):
    id: str
    name: str
    category: str | None = None
    created_at: str


class Listing(BaseModel):
    id: str
    owner_id: str
    category_id: str | None = None
    title: str
    description: str | None = None
    price: float
    unit: str
    quantity: float
    images: list[str]
    status: ListingStatus
    created_at: str
    updated_at: str
    crop_compatibility: list[str]
    brand: str | None = None
    condition: str | None = None
    location: Location | None = None
    seller_role: str | None = None


class ListingWithRelations(Listing):
    """Browse, detail and moderation reads embed the category and the owner; create and update do not."""

    category: CategoryRef | None = None
    owner: OwnerRef | None = None
    # Browse and detail fill it (A4); the moderation list leaves it out.
    availability: Availability | None = None
