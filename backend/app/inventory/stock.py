"""Stock and locations (B2 sub-lane; SRDS §17): stock by product and location, the dealer's storage places, and
transfers between them. Stock itself is read only here; it changes through transfer_stock and the other stock functions.
"""

from fastapi import APIRouter, Depends, HTTPException
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.common.errors import AppHTTPException
from app.common.pagination import Page, paginate
from app.inventory import repository as repo
from app.inventory.errors import stock_errors
from app.inventory.idempotent import idempotency_key, run_once
from app.inventory.schemas import Location, LocationInput, LocationUpdateInput, Movement, StockLevel, TransferInput

LOCATIONS = "inventory_locations"
# The location a dealer gets when they record stock before naming any place (the same name B1 gave carried-over stock).
FIRST_LOCATION_NAME = "Main store"

router = APIRouter()


# --- service ----------------------------------------------------------------------------------------------------------


async def ensure_default_location(user: AuthenticatedUser) -> dict:
    """The dealer's default location, the one marketplace dispatch takes from (D8). A dealer with none yet gets a
    "Main store", so stock recorded through the older screens always has a place to go."""
    default = await repo.fetch_default_location(user.access_token)
    if default is not None:
        return default
    existing = await repo.fetch_oldest_location(user.access_token)
    if existing is not None:
        return await _make_default(user, existing["id"])
    try:
        return await repo.create_row(
            user.access_token, LOCATIONS, user.id, {"name": FIRST_LOCATION_NAME, "kind": "shop", "is_default": True}
        )
    except APIError as exc:
        # Two first stock changes at once both found no location; the one-default index let the other request's
        # Main store in and refused this one (23505). Its default is the one this request needs.
        if exc.code != "23505":
            raise
        default = await repo.fetch_default_location(user.access_token)
        if default is None:
            raise
        return default


async def _make_default(user: AuthenticatedUser, location_id: str) -> dict:
    """Moves the default to `location_id` with set_default_location: one transaction, the current default locked first,
    so there is never a moment with none or two, and concurrent moves queue (B2 verification F7). Its refusals keep
    their message (errors.stock_errors): an inactive location (22023) or a broken default rule (23514) is the dealer's
    to read."""
    with stock_errors():
        await repo.set_default_location(user.access_token, location_id)
    return await get_location(user, location_id)


async def list_locations(user: AuthenticatedUser, include_inactive: bool = True) -> list[dict]:
    return await repo.list_active_or_all(user.access_token, LOCATIONS, include_inactive)


async def get_location(user: AuthenticatedUser, location_id: str) -> dict:
    location = await repo.fetch_row(user.access_token, LOCATIONS, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    return location


# A default location must stay usable: dispatch takes stock from it (D8), and the update path already refuses to
# deactivate it, so it cannot be created or made default while inactive either.
INACTIVE_DEFAULT = "The default location must be active"


async def create_location(user: AuthenticatedUser, fields: dict) -> dict:
    wants_default = bool(fields.pop("is_default", False))
    # The dealer's first location is the default whatever they asked: dispatch needs one (D8).
    first = await repo.fetch_default_location(user.access_token) is None
    if (first or wants_default) and fields.get("is_active") is False:
        raise AppHTTPException(409, INACTIVE_DEFAULT, "conflict")
    with stock_errors():
        if first:
            return await repo.create_row(user.access_token, LOCATIONS, user.id, {**fields, "is_default": True})
        # Inserted as an ordinary location, then made the default by the one function that moves it.
        location = await repo.create_row(user.access_token, LOCATIONS, user.id, {**fields, "is_default": False})
    return await _make_default(user, location["id"]) if wants_default else location


async def update_location(user: AuthenticatedUser, location_id: str, fields: dict) -> dict:
    current = await get_location(user, location_id)
    if current["is_default"] and (fields.get("is_default") is False or fields.get("is_active") is False):
        raise AppHTTPException(409, "This is the default location; make another location the default first", "conflict")
    make_default = fields.pop("is_default", None) is True and not current["is_default"]
    if make_default and fields.get("is_active", current["is_active"]) is False:
        raise AppHTTPException(409, INACTIVE_DEFAULT, "conflict")
    with stock_errors():
        location = await repo.update_row(user.access_token, LOCATIONS, location_id, fields) if fields else current
    return await _make_default(user, location_id) if make_default else location


async def delete_location(user: AuthenticatedUser, location_id: str) -> None:
    """A location with stock or history is deactivated, not deleted (the ledger keeps pointing at it). The default
    cannot go: the marketplace takes stock from it."""
    current = await get_location(user, location_id)
    if current["is_default"]:
        raise AppHTTPException(409, "This is the default location; make another location the default first", "conflict")
    await repo.delete_or_deactivate(user.access_token, LOCATIONS, location_id)


async def list_stock(user: AuthenticatedUser, product_id: str | None, location_id: str | None) -> list[dict]:
    return await repo.fetch_stock(user.access_token, product_id, location_id)


async def transfer(user: AuthenticatedUser, fields: dict) -> list[dict]:
    """Both halves of the transfer (one TRANSFER out, one TRANSFER in, sharing a transfer id; SRDS §24)."""
    with stock_errors():
        transfer_id = await repo.transfer_stock(
            user.access_token,
            fields["product_id"],
            fields["from_location_id"],
            fields["to_location_id"],
            fields["quantity"],
            fields.get("reason"),
        )
    return await repo.fetch_transfer_movements(user.access_token, transfer_id)


# --- routes -----------------------------------------------------------------------------------------------------------


@router.get("/stock", response_model=list[StockLevel])
async def get_stock(
    product_id: str | None = None,
    location_id: str | None = None,
    user: AuthenticatedUser = Depends(require_dealer),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await list_stock(user, product_id, location_id))


@router.post("/stock/transfer", response_model=list[Movement], status_code=201)
async def post_transfer(
    request: TransferInput,
    user: AuthenticatedUser = Depends(require_dealer),
    key: str | None = Depends(idempotency_key),
) -> list[dict]:
    # An optional Idempotency-Key makes a retried transfer move the stock once (idempotent.py).
    return await run_once(user, key, "inventory.transfer", request, 201, lambda: transfer(user, request.model_dump()))


@router.get("/locations", response_model=list[Location])
async def get_locations(
    include_inactive: bool = True, user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await list_locations(user, include_inactive))


@router.post("/locations", response_model=Location, status_code=201)
async def post_location(request: LocationInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await create_location(user, request.model_dump())


@router.get("/locations/{location_id}", response_model=Location)
async def get_one_location(location_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await get_location(user, location_id)


@router.patch("/locations/{location_id}", response_model=Location)
async def patch_location(
    location_id: str, request: LocationUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await update_location(user, location_id, request.model_dump(exclude_unset=True))


@router.delete("/locations/{location_id}", status_code=204)
async def remove_location(location_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await delete_location(user, location_id)
