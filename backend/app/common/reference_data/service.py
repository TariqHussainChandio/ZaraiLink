from typing import Any

from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
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
    await log_admin_action(user, "create_reference_data", table, created["id"], new_state=row)
    return created


async def update_row(user: AuthenticatedUser, table: RefDataTable, row_id: str, patch: dict[str, Any]) -> None:
    await repo.update_row(user.access_token, table, row_id, patch)
    await log_admin_action(user, "update_reference_data", table, row_id, new_state=patch)


async def delete_row(user: AuthenticatedUser, table: RefDataTable, row_id: str) -> None:
    await repo.delete_row(user.access_token, table, row_id)
    await log_admin_action(user, "delete_reference_data", table, row_id)
