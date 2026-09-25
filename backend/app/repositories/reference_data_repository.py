from typing import Any, Literal

from ..core.pagination import page_range
from ..core.rows import as_rows, first_row
from ..core.supabase_client import get_public_client, get_user_scoped_client

RefDataTable = Literal["currencies", "units"]


async def fetch_currencies() -> list[dict]:
    response = await get_public_client().table("currencies").select("*").order("code").range(*page_range()).execute()
    return as_rows(response)


async def fetch_units() -> list[dict]:
    response = await get_public_client().table("units").select("*").order("label").range(*page_range()).execute()
    return as_rows(response)


async def fetch_rows(table: RefDataTable) -> list[dict]:
    response = await get_public_client().table(table).select("*").range(*page_range()).execute()
    return as_rows(response)


async def create_row(access_token: str, table: RefDataTable, row: dict[str, Any]) -> dict:
    client = await get_user_scoped_client(access_token)
    response = await client.table(table).insert(row).execute()
    return first_row(response)


async def update_row(access_token: str, table: RefDataTable, row_id: str, patch: dict[str, Any]) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table(table).update(patch).eq("id", row_id).execute()


async def delete_row(access_token: str, table: RefDataTable, row_id: str) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table(table).delete().eq("id", row_id).execute()
