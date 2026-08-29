from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_farmer
from ....schemas.farmer import FarmCropInput, FarmerProfileInput, FarmInput, FarmUpdateInput
from ....services import farmer_service as service

router = APIRouter(prefix="/api/v1/farmer", tags=["farmer"])


@router.get("/farms")
async def list_farms(user: AuthenticatedUser = Depends(require_farmer)) -> list[dict]:
    return service.fetch_farms(user)


@router.post("/farms")
async def create_farm(request: FarmInput, user: AuthenticatedUser = Depends(require_farmer)) -> dict:
    return service.create_farm(user, request)


@router.get("/farms/{farm_id}")
async def get_farm(farm_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> dict:
    return service.fetch_farm_by_id(user, farm_id)


@router.patch("/farms/{farm_id}")
async def update_farm(
    farm_id: str, request: FarmUpdateInput, user: AuthenticatedUser = Depends(require_farmer)
) -> dict:
    return service.update_farm(user, farm_id, request)


@router.delete("/farms/{farm_id}", status_code=204)
async def delete_farm(farm_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> None:
    service.delete_farm(user, farm_id)


@router.get("/farms/{farm_id}/crops")
async def list_farm_crops(farm_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> list[dict]:
    return service.fetch_farm_crops(user, farm_id)


@router.post("/farms/{farm_id}/crops")
async def create_farm_crop(
    farm_id: str, request: FarmCropInput, user: AuthenticatedUser = Depends(require_farmer)
) -> dict:
    return service.create_farm_crop(user, farm_id, request.model_dump())


@router.get("/crops/{farm_crop_id}")
async def get_farm_crop(farm_crop_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> dict:
    return service.fetch_farm_crop_by_id(user, farm_crop_id)


@router.patch("/crops/{farm_crop_id}")
async def update_farm_crop(
    farm_crop_id: str, request: FarmCropInput, user: AuthenticatedUser = Depends(require_farmer)
) -> dict:
    return service.update_farm_crop(user, farm_crop_id, request.model_dump(exclude_unset=True))


@router.delete("/crops/{farm_crop_id}", status_code=204)
async def delete_farm_crop(farm_crop_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> None:
    service.delete_farm_crop(user, farm_crop_id)


@router.get("/profile")
async def get_farmer_profile(user: AuthenticatedUser = Depends(require_farmer)) -> dict | None:
    return service.fetch_farmer_profile(user)


@router.put("/profile", status_code=204)
async def upsert_farmer_profile(
    request: FarmerProfileInput, user: AuthenticatedUser = Depends(require_farmer)
) -> None:
    service.upsert_farmer_profile(user, request.experience, request.agricultural_info)
