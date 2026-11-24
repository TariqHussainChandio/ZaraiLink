"""Reference data business logic: reads, and admin edits done as the admin."""

from typing import Any

from app.auth.dependencies import AuthenticatedUser
from app.common.reference_data import repository as repo
from app.common.reference_data.repository import RefDataTable


# Returns all currencies.
async def fetch_currencies() -> list[dict]:
    return await repo.fetch_currencies()


# Returns all measurement units.
async def fetch_units() -> list[dict]:
    return await repo.fetch_units()


# Returns every row of one reference table.
async def fetch_rows(table: RefDataTable) -> list[dict]:
    return await repo.fetch_rows(table)


# Adds a row as the admin.
async def create_row(user: AuthenticatedUser, table: RefDataTable, row: dict[str, Any]) -> dict:
    created = await repo.create_row(user.access_token, table, row)
    # The audit row is written atomically by the database (20261023080000).
    return created


# Updates a row as the admin.
async def update_row(user: AuthenticatedUser, table: RefDataTable, row_id: str, patch: dict[str, Any]) -> None:
    await repo.update_row(user.access_token, table, row_id, patch)
    # The audit row is written atomically by the database (20261023080000).


# Deletes a row as the admin.
async def delete_row(user: AuthenticatedUser, table: RefDataTable, row_id: str) -> None:
    await repo.delete_row(user.access_token, table, row_id)
    # The audit row is written atomically by the database (20261023080000).
