from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_farmer
from app.common.pagination import Page, paginate
from app.farmer import service
from app.farmer.schemas import (
    Farm,
    FarmCrop,
    FarmCropInput,
    FarmCropWithCrop,
    FarmerProfile,
    FarmerProfileInput,
    FarmInput,
    FarmUpdateInput,
)

router = APIRouter(prefix="/api/v1/farmer", tags=["farmer"])


@router.get("/farms", response_model=list[Farm])
async def list_farms(user: AuthenticatedUser = Depends(require_farmer), page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_farms(user))


@router.post("/farms", response_model=Farm)
async def create_farm(request: FarmInput, user: AuthenticatedUser = Depends(require_farmer)) -> dict:
    return await service.create_farm(user, request)


@router.get("/farms/{farm_id}", response_model=Farm)
async def get_farm(farm_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> dict:
    return await service.fetch_farm_by_id(user, farm_id)


@router.patch("/farms/{farm_id}", response_model=Farm)
async def update_farm(
    farm_id: str, request: FarmUpdateInput, user: AuthenticatedUser = Depends(require_farmer)
) -> dict:
    return await service.update_farm(user, farm_id, request)


@router.delete("/farms/{farm_id}", status_code=204)
async def delete_farm(farm_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> None:
    await service.delete_farm(user, farm_id)


@router.get("/farms/{farm_id}/crops", response_model=list[FarmCropWithCrop])
async def list_farm_crops(
    farm_id: str, user: AuthenticatedUser = Depends(require_farmer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_farm_crops(user, farm_id))


@router.post("/farms/{farm_id}/crops", response_model=FarmCrop)
async def create_farm_crop(
    farm_id: str, request: FarmCropInput, user: AuthenticatedUser = Depends(require_farmer)
) -> dict:
    return await service.create_farm_crop(user, farm_id, request.model_dump())


@router.get("/crops/{farm_crop_id}", response_model=FarmCropWithCrop)
async def get_farm_crop(farm_crop_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> dict:
    return await service.fetch_farm_crop_by_id(user, farm_crop_id)


@router.patch("/crops/{farm_crop_id}", response_model=FarmCrop)
async def update_farm_crop(
    farm_crop_id: str, request: FarmCropInput, user: AuthenticatedUser = Depends(require_farmer)
) -> dict:
    return await service.update_farm_crop(user, farm_crop_id, request.model_dump(exclude_unset=True))


@router.delete("/crops/{farm_crop_id}", status_code=204)
async def delete_farm_crop(farm_crop_id: str, user: AuthenticatedUser = Depends(require_farmer)) -> None:
    await service.delete_farm_crop(user, farm_crop_id)


@router.get("/profile", response_model=FarmerProfile | None)
async def get_farmer_profile(user: AuthenticatedUser = Depends(require_farmer)) -> dict | None:
    return await service.fetch_farmer_profile(user)


@router.put("/profile", status_code=204)
async def upsert_farmer_profile(request: FarmerProfileInput, user: AuthenticatedUser = Depends(require_farmer)) -> None:
    await service.upsert_farmer_profile(user, request.experience, request.agricultural_info)
