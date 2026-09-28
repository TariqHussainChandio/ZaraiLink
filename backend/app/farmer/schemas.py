from pydantic import BaseModel

from app.common.schemas import Location


class FarmInput(BaseModel):
    name: str
    area: float | None = None
    land_unit: str | None = None
    notes: str | None = None
    country: str | None = None
    province: str | None = None
    city: str | None = None


class FarmUpdateInput(BaseModel):
    name: str | None = None
    area: float | None = None
    land_unit: str | None = None
    notes: str | None = None
    country: str | None = None
    province: str | None = None
    city: str | None = None


class FarmCropInput(BaseModel):
    crop_id: str | None = None
    variety: str | None = None
    planting_date: str | None = None
    area: float | None = None
    expected_harvest_date: str | None = None
    growth_stage: str | None = None
    notes: str | None = None


class FarmerProfileInput(BaseModel):
    experience: str | None = None
    agricultural_info: str | None = None


# ---- response models (P7 7A)


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


class CropRef(BaseModel):
    id: str
    name: str


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


class FarmerProfile(BaseModel):
    id: str
    experience: str | None = None
    agricultural_info: str | None = None
    updated_at: str
