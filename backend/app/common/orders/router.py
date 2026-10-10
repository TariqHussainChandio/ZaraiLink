from typing import Literal

from fastapi import APIRouter, Depends, Header, Query

from app.auth.dependencies import AuthenticatedUser, require_authenticated_user, require_marketplace_buyer
from app.common import idempotency
from app.common.orders import service
from app.common.orders.schemas import (
    CheckoutRequest,
    Order,
    OrderStatusHistoryEntry,
    OrderWithItems,
    UpdateOrderStatusRequest,
)
from app.common.pagination import Page, paginate

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


@router.post("/checkout", response_model=list[Order])
async def checkout(
    request: CheckoutRequest,
    user: AuthenticatedUser = Depends(require_marketplace_buyer),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> list[dict]:
    claim = await idempotency.begin(user, idempotency_key, "orders.checkout", idempotency.fingerprint(request))
    if claim and claim.replay is not None:
        return claim.replay
    finished = False
    try:
        cart_items = [item.model_dump() for item in request.cart_items]
        orders = await service.checkout(user, cart_items, request.delivery_charge_by_seller)
        if claim:
            await claim.complete(200, orders)
        finished = True
        return orders
    finally:
        # Any failure releases the key so the client's retry can run the work again.
        if claim and not finished:
            await claim.abandon()


@router.get("", response_model=list[OrderWithItems])
async def list_orders(
    as_: Literal["buyer", "seller"] = Query(default="buyer", alias="as"),
    user: AuthenticatedUser = Depends(require_authenticated_user),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_orders_for_user(user, as_))


@router.get("/{order_id}", response_model=OrderWithItems)
async def get_order(order_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return await service.fetch_order_by_id(user, order_id)


@router.get("/{order_id}/status-history", response_model=list[OrderStatusHistoryEntry])
async def get_status_history(
    order_id: str, user: AuthenticatedUser = Depends(require_authenticated_user), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_order_status_history(user, order_id))


@router.patch("/{order_id}/status", status_code=204)
async def update_order_status(
    order_id: str, request: UpdateOrderStatusRequest, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> None:
    await service.update_order_status(user, order_id, request.to)
