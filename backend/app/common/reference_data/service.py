from typing import Any

from app.auth.dependencies import AuthenticatedUser
from app.common.reference_data import repository as repo
from app.common.reference_data.repository import RefDataTable


async def fetch_currencies() -> list[dict]:
    return await repo.fetch_currencies()


async def fetch_units() -> list[dict]:
    return await repo.fetch_units()


async def fetch_rows(table: RefDataTable) -> list[dict]:
    return await repo.fetch_rows(table)


async def create_row(user: AuthenticatedUser, table: RefDataTable, row: dict[str, Any]) -> dict:
    created = await repo.create_row(user.access_token, table, row)
    # The audit row is written atomically by the database (20261023080000).
    return created


async def update_row(user: AuthenticatedUser, table: RefDataTable, row_id: str, patch: dict[str, Any]) -> None:
    await repo.update_row(user.access_token, table, row_id, patch)
    # The audit row is written atomically by the database (20261023080000).


async def delete_row(user: AuthenticatedUser, table: RefDataTable, row_id: str) -> None:
    await repo.delete_row(user.access_token, table, row_id)
    # The audit row is written atomically by the database (20261023080000).
