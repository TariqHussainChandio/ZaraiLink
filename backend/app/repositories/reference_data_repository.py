from typing import Any, Literal

from ..core.supabase_client import get_public_client, get_user_scoped_client

RefDataTable = Literal["currencies", "units"]


def fetch_currencies() -> list[dict]:
    return get_public_client().table("currencies").select("*").order("code").execute().data or []


def fetch_units() -> list[dict]:
    return get_public_client().table("units").select("*").order("label").execute().data or []


def fetch_rows(table: RefDataTable) -> list[dict]:
    return get_public_client().table(table).select("*").limit(500).execute().data or []


def create_row(access_token: str, table: RefDataTable, row: dict[str, Any]) -> dict:
    response = get_user_scoped_client(access_token).table(table).insert(row).execute()
    return response.data[0]


def update_row(access_token: str, table: RefDataTable, row_id: str, patch: dict[str, Any]) -> None:
    get_user_scoped_client(access_token).table(table).update(patch).eq("id", row_id).execute()


def delete_row(access_token: str, table: RefDataTable, row_id: str) -> None:
    get_user_scoped_client(access_token).table(table).delete().eq("id", row_id).execute()
