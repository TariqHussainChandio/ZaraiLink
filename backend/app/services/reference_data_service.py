from typing import Any

from ..core.auth import AuthenticatedUser
from ..repositories import reference_data_repository as repo
from ..repositories.reference_data_repository import RefDataTable
from .audit_log_service import log_admin_action


def fetch_countries() -> list[dict]:
    return repo.fetch_countries()


def fetch_provinces(country_id: str) -> list[dict]:
    return repo.fetch_provinces(country_id)


def fetch_cities(province_id: str) -> list[dict]:
    return repo.fetch_cities(province_id)


def fetch_phone_codes() -> list[dict]:
    return repo.fetch_phone_codes()


def fetch_currencies() -> list[dict]:
    return repo.fetch_currencies()


def fetch_units() -> list[dict]:
    return repo.fetch_units()


def fetch_rows(table: RefDataTable) -> list[dict]:
    return repo.fetch_rows(table)


def create_row(user: AuthenticatedUser, table: RefDataTable, row: dict[str, Any]) -> dict:
    created = repo.create_row(user.access_token, table, row)
    log_admin_action(user, "create_reference_data", table, created["id"], new_state=row)
    return created


def update_row(user: AuthenticatedUser, table: RefDataTable, row_id: str, patch: dict[str, Any]) -> None:
    repo.update_row(user.access_token, table, row_id, patch)
    log_admin_action(user, "update_reference_data", table, row_id, new_state=patch)


def delete_row(user: AuthenticatedUser, table: RefDataTable, row_id: str) -> None:
    repo.delete_row(user.access_token, table, row_id)
    log_admin_action(user, "delete_reference_data", table, row_id)
