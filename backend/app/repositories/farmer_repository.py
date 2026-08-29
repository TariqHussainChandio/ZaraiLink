from typing import Any

from ..core.supabase_client import get_user_scoped_client

FARM_CROP_SELECT = "*, crop:crops(id,name)"


def fetch_farms(access_token: str, owner_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("farms")
        .select("*")
        .eq("owner_id", owner_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_farm_by_id(access_token: str, farm_id: str) -> dict | None:
    response = get_user_scoped_client(access_token).table("farms").select("*").eq("id", farm_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def create_farm(access_token: str, owner_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("farms")
        .insert({"owner_id": owner_id, **fields})
        .select()
        .single()
        .execute()
    )
    return response.data


def update_farm(access_token: str, farm_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token).table("farms").update(fields).eq("id", farm_id).select().single().execute()
    )
    return response.data


def delete_farm(access_token: str, farm_id: str) -> None:
    get_user_scoped_client(access_token).table("farms").delete().eq("id", farm_id).execute()


def fetch_farm_crops(access_token: str, farm_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("farm_crops")
        .select(FARM_CROP_SELECT)
        .eq("farm_id", farm_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )


def fetch_farm_crop_by_id(access_token: str, farm_crop_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("farm_crops")
        .select(FARM_CROP_SELECT)
        .eq("id", farm_crop_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def create_farm_crop(access_token: str, farm_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("farm_crops")
        .insert({"farm_id": farm_id, **fields})
        .select()
        .single()
        .execute()
    )
    return response.data


def update_farm_crop(access_token: str, farm_crop_id: str, fields: dict[str, Any]) -> dict:
    response = (
        get_user_scoped_client(access_token)
        .table("farm_crops")
        .update(fields)
        .eq("id", farm_crop_id)
        .select()
        .single()
        .execute()
    )
    return response.data


def delete_farm_crop(access_token: str, farm_crop_id: str) -> None:
    get_user_scoped_client(access_token).table("farm_crops").delete().eq("id", farm_crop_id).execute()


def fetch_farmer_profile(access_token: str, user_id: str) -> dict | None:
    response = (
        get_user_scoped_client(access_token)
        .table("farmer_profiles")
        .select("*")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return response.data if response else None


def upsert_farmer_profile(access_token: str, user_id: str, fields: dict[str, Any]) -> None:
    get_user_scoped_client(access_token).table("farmer_profiles").upsert({"id": user_id, **fields}).execute()
