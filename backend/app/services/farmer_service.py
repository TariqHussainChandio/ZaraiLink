from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import farmer_repository as repo
from ..schemas.farmer import FarmInput, FarmUpdateInput


def _location(country_id: str | None, province_id: str | None, city_id: str | None) -> dict | None:
    if not country_id and not province_id and not city_id:
        return None
    return {"country_id": country_id, "province_id": province_id, "city_id": city_id}


def fetch_farms(user: AuthenticatedUser) -> list[dict]:
    return repo.fetch_farms(user.access_token, user.id)


def fetch_farm_by_id(user: AuthenticatedUser, farm_id: str) -> dict:
    farm = repo.fetch_farm_by_id(user.access_token, farm_id)
    if farm is None:
        raise HTTPException(status_code=404, detail="Farm not found")
    return farm


def create_farm(user: AuthenticatedUser, input: FarmInput) -> dict:
    fields = {
        "name": input.name,
        "area": input.area,
        "land_unit": input.land_unit,
        "notes": input.notes,
        "location": _location(input.country_id, input.province_id, input.city_id),
    }
    return repo.create_farm(user.access_token, user.id, fields)


def update_farm(user: AuthenticatedUser, farm_id: str, input: FarmUpdateInput) -> dict:
    provided = input.model_dump(exclude_unset=True)
    location_touched = any(k in provided for k in ("country_id", "province_id", "city_id"))
    fields = {k: v for k, v in provided.items() if k not in ("country_id", "province_id", "city_id")}
    if location_touched:
        fields["location"] = _location(
            provided.get("country_id"), provided.get("province_id"), provided.get("city_id")
        )
    return repo.update_farm(user.access_token, farm_id, fields)


def delete_farm(user: AuthenticatedUser, farm_id: str) -> None:
    repo.delete_farm(user.access_token, farm_id)


def fetch_farm_crops(user: AuthenticatedUser, farm_id: str) -> list[dict]:
    return repo.fetch_farm_crops(user.access_token, farm_id)


def fetch_farm_crop_by_id(user: AuthenticatedUser, farm_crop_id: str) -> dict:
    crop = repo.fetch_farm_crop_by_id(user.access_token, farm_crop_id)
    if crop is None:
        raise HTTPException(status_code=404, detail="Crop not found")
    return crop


def create_farm_crop(user: AuthenticatedUser, farm_id: str, fields: dict) -> dict:
    return repo.create_farm_crop(user.access_token, farm_id, fields)


def update_farm_crop(user: AuthenticatedUser, farm_crop_id: str, patch: dict) -> dict:
    return repo.update_farm_crop(user.access_token, farm_crop_id, patch)


def delete_farm_crop(user: AuthenticatedUser, farm_crop_id: str) -> None:
    repo.delete_farm_crop(user.access_token, farm_crop_id)


def fetch_farmer_profile(user: AuthenticatedUser) -> dict | None:
    return repo.fetch_farmer_profile(user.access_token, user.id)


def upsert_farmer_profile(user: AuthenticatedUser, experience: str | None, agricultural_info: str | None) -> None:
    repo.upsert_farmer_profile(
        user.access_token, user.id, {"experience": experience, "agricultural_info": agricultural_info}
    )
