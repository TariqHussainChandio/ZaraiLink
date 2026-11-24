"""Reference data routes: public lists of currencies and units, admin create, update, delete."""

from typing import Any

from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_admin
from app.common.pagination import Page, paginate
from app.common.reference_data import service
from app.common.reference_data.repository import RefDataTable
from app.common.reference_data.schemas import Currency, Unit

router = APIRouter(prefix="/api/v1/reference-data", tags=["reference-data"])

# Public reads (no auth dependency): the database itself already grants `select` on these two
# tables to `anon` (supabase/migrations/20260822090800_reference_data.sql), so requiring
# authentication here would be gatekeeping data the project's own RLS says is public — not
# "consistency for its own sake."


# Public list of currencies.
@router.get("/currencies", response_model=list[Currency])
async def list_currencies(page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_currencies())


# Public list of measurement units.
@router.get("/units", response_model=list[Unit])
async def list_units(page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_units())


# Every row of one reference table, for the admin editor.
@router.get("/{table}/rows", response_model=list[Currency | Unit])
async def list_rows(table: RefDataTable, page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_rows(table))


# Writes: admin-only, matching the `<table>_admin_insert/update/delete` RLS policies on both tables.


# Admin only: adds a row to a reference table.
@router.post("/{table}/rows", response_model=Currency | Unit, status_code=201)
async def create_row(
    table: RefDataTable,
    row: dict[str, Any],
    user: AuthenticatedUser = Depends(require_admin),
) -> dict:
    return await service.create_row(user, table, row)


# Admin only: edits a row of a reference table.
@router.patch("/{table}/rows/{row_id}", status_code=204)
async def update_row(
    table: RefDataTable,
    row_id: str,
    patch: dict[str, Any],
    user: AuthenticatedUser = Depends(require_admin),
) -> None:
    await service.update_row(user, table, row_id, patch)


# Admin only: deletes a row of a reference table.
@router.delete("/{table}/rows/{row_id}", status_code=204)
async def delete_row(
    table: RefDataTable,
    row_id: str,
    user: AuthenticatedUser = Depends(require_admin),
) -> None:
    await service.delete_row(user, table, row_id)
