"""Typed access to the rows of a PostgREST response.

supabase-py 2.31 types `response.data` as the full JSON union, so every `data[0]["id"]` needs narrowing. The
rows are dicts by construction (a select/insert/update on a table), so the narrowing is done once here
instead of casting at each of the ~100 call sites.
"""

from typing import Any, Protocol, cast

from fastapi import HTTPException

Row = dict[str, Any]


class _HasData(Protocol):
    data: Any


def as_rows(response: _HasData) -> list[Row]:
    """All returned rows; an empty result is an empty list."""
    return cast(list[Row], response.data or [])


def first_row(response: _HasData) -> Row:
    """The first returned row of an insert or update.

    An update that matched nothing (an id that does not exist, or a row row-level security hides from the caller)
    returns no rows; that is a 404 for the caller, not a server error. It surfaced as an IndexError and a 500 on
    every PATCH of a missing id (found by the property-based contract test)."""
    rows = as_rows(response)
    if not rows:
        raise HTTPException(status_code=404, detail="Not found")
    return rows[0]


def maybe_row(response: _HasData) -> Row | None:
    """The first returned row, or None when the query matched nothing."""
    rows = as_rows(response)
    return rows[0] if rows else None


def row_or_none(response: _HasData | None) -> Row | None:
    """The object a `.maybe_single()` query returns (None for no match, or for no response at all)."""
    return cast(Row | None, response.data) if response else None


def rpc_row(response: _HasData) -> Row:
    """The single object a Postgres function returning one row (or jsonb object) gives back."""
    return cast(Row, response.data)
