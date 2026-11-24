"""Request and response models for the farmer API."""

from pydantic import BaseModel

from app.common.schemas import Location


# Body for creating a farm.
class FarmInput(BaseModel):
    name: str
    area: float | None = None
    land_unit: str | None = None
    notes: str | None = None
    country: str | None = None
    province: str | None = None
    city: str | None = None


# Body for editing a farm; every field is optional.
class FarmUpdateInput(BaseModel):
    name: str | None = None
    area: float | None = None
    land_unit: str | None = None
    notes: str | None = None
    country: str | None = None
    province: str | None = None
    city: str | None = None


# Body for adding or editing a crop on a farm.
class FarmCropInput(BaseModel):
    crop_id: str | None = None
    variety: str | None = None
    planting_date: str | None = None
    area: float | None = None
    expected_harvest_date: str | None = None
    growth_stage: str | None = None
    notes: str | None = None


# Body for saving the farmer profile.
class FarmerProfileInput(BaseModel):
    experience: str | None = None
    agricultural_info: str | None = None


# ---- response models (P7 7A)


# A farm as the API returns it.
class Farm(BaseModel):
    id: str
    owner_id: str
    name: str
    location: Location | None = None
    area: float | None = None
    land_unit: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str


# A crop's id and name, embedded in a farm crop.
class CropRef(BaseModel):
    id: str
    name: str


# A crop recorded on a farm.
class FarmCrop(BaseModel):
    id: str
    farm_id: str
    crop_id: str | None = None
    variety: str | None = None
    planting_date: str | None = None
    area: float | None = None
    expected_harvest_date: str | None = None
    growth_stage: str | None = None
    notes: str | None = None
    created_at: str
    updated_at: str


class FarmCropWithCrop(FarmCrop):
    """Reads embed the crop; create and update return the bare row."""

    crop: CropRef | None = None


# The farmer's profile details.
class FarmerProfile(BaseModel):
    id: str
    experience: str | None = None
    agricultural_info: str | None = None
    updated_at: str
