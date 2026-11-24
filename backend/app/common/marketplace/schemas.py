"""Marketplace request and response shapes."""

from typing import Literal

from pydantic import BaseModel

from app.common.schemas import Location

ListingStatus = Literal["active", "inactive", "sold"]
# The "Listing availability" contract (docs/plan.md §5): a word per listing, never the seller's stock figures.
# `unknown` when the answer could not be had (from B3, an IMS timeout), never an error.
Availability = Literal["in_stock", "low_stock", "out_of_stock", "unknown"]


# Body for creating a category.
class CategoryInput(BaseModel):
    name: str
    slug: str
    icon: str | None = None


# Body for editing a category; every field is optional.
class CategoryUpdateInput(BaseModel):
    name: str | None = None
    slug: str | None = None
    icon: str | None = None


# Body for creating a listing.
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
    # The dealer's IMS product this listing sells from (B3, contract "Listing availability"): availability then comes
    # from that product's stock. The database trigger guard_inventory_references refuses another dealer's product.
    inventory_product_id: str | None = None


# Body for editing a listing; every field is optional.
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
    # The dealer's IMS product this listing sells from (B3, contract "Listing availability"): availability then comes
    # from that product's stock. The database trigger guard_inventory_references refuses another dealer's product.
    inventory_product_id: str | None = None


# Body for changing a listing's status.
class UpdateListingStatusRequest(BaseModel):
    status: ListingStatus


# Body asking for the view counts of some listings.
class ViewCountsRequest(BaseModel):
    listing_ids: list[str]


# ---- response models (typed, so the published OpenAPI document matches the responses)


# A category as returned by the API.
class Category(BaseModel):
    id: str
    name: str
    slug: str
    icon: str | None = None
    created_at: str


# A short category reference shown with a listing.
class CategoryRef(BaseModel):
    id: str
    name: str
    slug: str


# A short owner (seller) reference shown with a listing.
class OwnerRef(BaseModel):
    id: str
    full_name: str
    avatar_url: str | None = None


class ListingFilterOptions(BaseModel):
    """What the market's filters can offer right now (D20), from the listings for sale: the cities they are in and the
    lowest and highest price. Both prices are null when nothing is for sale."""

    cities: list[str]
    min_price: float | None = None
    max_price: float | None = None


# A crop as returned by the API.
class Crop(BaseModel):
    id: str
    name: str
    category: str | None = None
    created_at: str


# A listing as returned by the API.
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
    inventory_product_id: str | None = None


class ListingWithRelations(Listing):
    """Browse, detail and moderation reads embed the category and the owner; create and update do not."""

    category: CategoryRef | None = None
    owner: OwnerRef | None = None
    # Browse and detail fill it (A4); the moderation list leaves it out.
    availability: Availability | None = None
