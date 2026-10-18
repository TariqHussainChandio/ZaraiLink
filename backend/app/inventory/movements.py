"""Stock movements (B2 sub-lane; SRDS §22-§24): the ledger with its filters, and the three manual operations, Stock In,
Stock Out and Adjustment. Each writes exactly one movement through record_movement, which locks the stock row, checks
the quantity and refuses the sources that have their own flow (ZARAILINK_ORDER, PURCHASE, TRANSFER).
"""

from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.common.pagination import Page, paginate
from app.inventory import repository as repo
from app.inventory.errors import stock_errors
from app.inventory.idempotent import idempotency_key, run_once
from app.inventory.schemas import (
    AdjustmentInput,
    Day,
    Movement,
    MovementDirection,
    MovementSource,
    StockInInput,
    StockOutInput,
)

router = APIRouter()


# --- service ----------------------------------------------------------------------------------------------------------


def day_start(day: date) -> str:
    """Days are UTC days, as everywhere else in the API (admin analytics buckets the same way)."""
    return datetime.combine(day, time.min, tzinfo=UTC).isoformat()


async def list_movements(
    user: AuthenticatedUser,
    sources: Sequence[str] | None = None,
    product_id: str | None = None,
    location_id: str | None = None,
    direction: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> list[dict]:
    return await repo.fetch_movements(
        user.access_token,
        product_id=product_id,
        location_id=location_id,
        sources=list(sources) if sources else None,
        direction=direction,
        since=day_start(date_from) if date_from else None,
        # `to` is a whole day, so the bound is the start of the next one.
        before=day_start(date_to + timedelta(days=1)) if date_to else None,
    )


async def get_movement(user: AuthenticatedUser, movement_id: str) -> dict:
    movement = await repo.fetch_row(user.access_token, "inventory_movements", movement_id)
    if movement is None:
        raise HTTPException(status_code=404, detail="Movement not found")
    return movement


async def record(
    user: AuthenticatedUser,
    product_id: str,
    location_id: str,
    direction: str,
    source: str,
    quantity: float,
    reason: str | None,
) -> dict:
    """One movement through record_movement, returned as the ledger row it wrote."""
    with stock_errors():
        movement_id = await repo.record_movement(
            user.access_token, product_id, location_id, direction, source, quantity, reason
        )
    return await get_movement(user, movement_id)


# --- routes -----------------------------------------------------------------------------------------------------------


@router.get("/movements", response_model=list[Movement])
async def get_movements(
    source: list[MovementSource] | None = Query(None),
    product_id: str | None = None,
    location_id: str | None = None,
    direction: MovementDirection | None = None,
    # The reports' day type: YYYY-MM-DD only, and within the range where `to` + 1 day (the read's bound) exists.
    date_from: Day | None = Query(None, alias="from"),
    date_to: Day | None = Query(None, alias="to"),
    user: AuthenticatedUser = Depends(require_dealer),
    page: Page = Depends(paginate),
) -> list[dict]:
    """The ledger, newest first. `source` may repeat; `from` and `to` are inclusive dates (UTC)."""
    sources = list(source) if source else None
    return page.finish(await list_movements(user, sources, product_id, location_id, direction, date_from, date_to))


@router.get("/movements/{movement_id}", response_model=Movement)
async def get_one_movement(movement_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await get_movement(user, movement_id)


# The three writes take an optional Idempotency-Key, so a retried request records its movement once (idempotent.py).


@router.post("/movements/stock-in", response_model=Movement, status_code=201)
async def post_stock_in(
    request: StockInInput,
    user: AuthenticatedUser = Depends(require_dealer),
    key: str | None = Depends(idempotency_key),
) -> dict:
    return await run_once(
        user,
        key,
        "inventory.stock_in",
        request,
        201,
        lambda: record(
            user, request.product_id, request.location_id, "in", "RESTOCK", request.quantity, request.reason
        ),
    )


@router.post("/movements/stock-out", response_model=Movement, status_code=201)
async def post_stock_out(
    request: StockOutInput,
    user: AuthenticatedUser = Depends(require_dealer),
    key: str | None = Depends(idempotency_key),
) -> dict:
    return await run_once(
        user,
        key,
        "inventory.stock_out",
        request,
        201,
        lambda: record(
            user, request.product_id, request.location_id, "out", request.source, request.quantity, request.reason
        ),
    )


@router.post("/movements/adjustment", response_model=Movement, status_code=201)
async def post_adjustment(
    request: AdjustmentInput,
    user: AuthenticatedUser = Depends(require_dealer),
    key: str | None = Depends(idempotency_key),
) -> dict:
    return await run_once(
        user,
        key,
        "inventory.adjustment",
        request,
        201,
        lambda: record(
            user,
            request.product_id,
            request.location_id,
            request.direction,
            "MANUAL_ADJUSTMENT",
            request.quantity,
            request.reason,
        ),
    )
