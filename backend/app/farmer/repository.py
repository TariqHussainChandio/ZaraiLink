"""Database reads and writes for farms, farm crops and farmer profiles (RLS applies per user)."""

from typing import Any

from app.common.pagination import page_range
from app.common.rows import as_rows, first_row, row_or_none
from app.database.supabase_client import get_user_scoped_client

# Columns for a farm crop, with the crop's id and name joined in.
FARM_CROP_SELECT = "*, crop:crops(id,name)"


# Lists one owner's farms, newest first, one page at a time.
async def fetch_farms(access_token: str, owner_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("farms")
        .select("*")
        .eq("owner_id", owner_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


# Gets one farm by id, or None if missing or not visible to the user.
async def fetch_farm_by_id(access_token: str, farm_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("farms").select("*").eq("id", farm_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


# Inserts a farm for the owner and returns the new row.
async def create_farm(access_token: str, owner_id: str, fields: dict[str, Any]) -> dict:
    # N1 fix: insert() has no .select() on the pinned postgrest-py client — the write's own
    # returning=representation default already includes the full row.
    client = await get_user_scoped_client(access_token)
    response = await client.table("farms").insert({"owner_id": owner_id, **fields}).execute()
    return first_row(response)


# Updates a farm's fields and returns the changed row.
async def update_farm(access_token: str, farm_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("farms").update(fields).eq("id", farm_id).execute()
    return first_row(response)


# Deletes a farm.
async def delete_farm(access_token: str, farm_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("farms").delete().eq("id", farm_id).execute()


# Lists the crops on one farm, newest first, one page at a time.
async def fetch_farm_crops(access_token: str, farm_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("farm_crops")
        .select(FARM_CROP_SELECT)
        .eq("farm_id", farm_id)
        .order("created_at", desc=True)
        .range(*page_range())
        .execute()
    )
    return as_rows(response)


# Gets one farm crop by id, or None if missing or not visible.
async def fetch_farm_crop_by_id(access_token: str, farm_crop_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("farm_crops").select(FARM_CROP_SELECT).eq("id", farm_crop_id).limit(1).execute()
    rows = as_rows(response)
    return rows[0] if rows else None


# Inserts a crop on a farm and returns the new row.
async def create_farm_crop(access_token: str, farm_id: str, fields: dict[str, Any]) -> dict:
    # N1 fix — see create_farm's comment above.
    client = await get_user_scoped_client(access_token)
    response = await client.table("farm_crops").insert({"farm_id": farm_id, **fields}).execute()
    return first_row(response)


# Updates a farm crop and returns the changed row.
async def update_farm_crop(access_token: str, farm_crop_id: str, fields: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table("farm_crops").update(fields).eq("id", farm_crop_id).execute()
    return first_row(response)


# Deletes a farm crop.
async def delete_farm_crop(access_token: str, farm_crop_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("farm_crops").delete().eq("id", farm_crop_id).execute()


# Gets the user's farmer profile, or None if not created yet.
async def fetch_farmer_profile(access_token: str, user_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await client.table("farmer_profiles").select("*").eq("id", user_id).maybe_single().execute()
    return row_or_none(response)


# Creates or updates the user's farmer profile.
async def upsert_farmer_profile(access_token: str, user_id: str, fields: dict[str, Any]) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("farmer_profiles").upsert({"id": user_id, **fields}).execute()
