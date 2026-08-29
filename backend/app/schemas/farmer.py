from pydantic import BaseModel


class FarmInput(BaseModel):
    name: str
    area: float | None = None
    land_unit: str | None = None
    notes: str | None = None
    country_id: str | None = None
    province_id: str | None = None
    city_id: str | None = None


class FarmUpdateInput(BaseModel):
    name: str | None = None
    area: float | None = None
    land_unit: str | None = None
    notes: str | None = None
    country_id: str | None = None
    province_id: str | None = None
    city_id: str | None = None


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
