from typing import Literal

from fastapi import APIRouter, Depends, Query

from ....core.auth import AuthenticatedUser, require_authenticated_user
from ....schemas.orders import (
    CheckoutRequest,
    Order,
    OrderStatusHistoryEntry,
    OrderWithItems,
    UpdateOrderStatusRequest,
)
from ....services import orders_service as service

router = APIRouter(prefix="/api/v1/orders", tags=["orders"])


@router.post("/checkout", response_model=list[Order])
async def checkout(request: CheckoutRequest, user: AuthenticatedUser = Depends(require_authenticated_user)) -> list[dict]:
    cart_items = [item.model_dump() for item in request.cart_items]
    return service.checkout(user, cart_items, request.delivery_charge_by_seller)


@router.get("", response_model=list[OrderWithItems])
async def list_orders(
    as_: Literal["buyer", "seller"] = Query(default="buyer", alias="as"),
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> list[dict]:
    return service.fetch_orders_for_user(user, as_)


@router.get("/{order_id}", response_model=OrderWithItems)
async def get_order(order_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return service.fetch_order_by_id(user, order_id)


@router.get("/{order_id}/status-history", response_model=list[OrderStatusHistoryEntry])
async def get_status_history(
    order_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> list[dict]:
    return service.fetch_order_status_history(user, order_id)


@router.patch("/{order_id}/status", status_code=204)
async def update_order_status(
    order_id: str, request: UpdateOrderStatusRequest, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> None:
    service.update_order_status(user, order_id, request.to)
