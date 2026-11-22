"""The stock functions' errors, as the API reports them.

The global map (common/problem_details.py) gives every database error a fixed title and has no entry for P0001, so a
shortage would surface as a 500 and the function's own message ("Only 3 in stock at this location") would be lost.
The inventory routes keep that message, which is what the dealer needs to correct the entry.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from postgrest.exceptions import APIError

from app.common.errors import AppHTTPException, ErrorCode

# The codes the inventory functions raise (20261021080000_inventory_data_model.sql, 20261022090000_inventory_sync.sql).
_MAPPED: dict[str, tuple[int, ErrorCode]] = {
    # A movement would take a location below zero (inventory_apply_movement). The code the app already reads for the
    # dispatch shortage (A4), so both say the same thing.
    "P0001": (422, "insufficient_stock"),
    # A value the function refuses: a zero quantity, a direction the source does not allow, a missing reason, a
    # purchase that is not a draft, two equal transfer locations.
    "22023": (422, "validation_failed"),
    # Not an approved dealer (inventory_caller), or a product, location or supplier of another dealer.
    "42501": (403, "forbidden"),
    "P0002": (404, "not_found"),
}


# The default-location rules (20261025090000_purchase_atomic_writes.sql, B2 verification F7): the triggers raise 23514,
# the code of any broken check, and set_default_location raises 22023 for a target deactivated after the API read it.
# They answer 409 conflict with their message, as the API's own check of the same rule does (stock.INACTIVE_DEFAULT).
# Only these messages are the dealer's to read; another check violation keeps the generic answer
# (common/problem_details.py), which never shows a constraint's name. "You need a default location" is checked at
# commit (a deferred constraint trigger); PostgREST still returns it as the request's error, since it commits first.
DEFAULT_LOCATION_RULES = frozenset(
    {
        "The default location must be active",
        "You need a default location: make another location the default first",
    }
)


@contextmanager
def stock_errors() -> Iterator[None]:
    try:
        yield
    except APIError as exc:
        if str(exc.code) in ("23514", "22023") and exc.message in DEFAULT_LOCATION_RULES:
            raise AppHTTPException(409, exc.message, "conflict") from exc
        mapped = _MAPPED.get(str(exc.code))
        if mapped is None:
            raise
        status_code, code = mapped
        raise AppHTTPException(status_code, exc.message or "The stock change was refused", code) from exc
