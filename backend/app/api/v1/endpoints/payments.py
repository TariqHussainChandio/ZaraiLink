from fastapi import APIRouter, Depends

from ....core.auth import AuthenticatedUser, require_authenticated_user
from ....schemas.payments import InitiatePaymentRequest, MarkPaymentFailedRequest, Payment, PaymentTransaction
from ....services import payments_service as service

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.post("", response_model=Payment)
async def initiate_payment(
    request: InitiatePaymentRequest, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict:
    return service.initiate_payment(user, request.order_id, request.method)


@router.get("/{payment_id}", response_model=Payment)
async def get_payment(payment_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return service.fetch_payment_by_id(user, payment_id)


@router.get("/by-order/{order_id}", response_model=Payment | None)
async def get_payment_by_order(
    order_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict | None:
    return service.fetch_payment_by_order_id(user, order_id)


@router.get("/{payment_id}/transactions", response_model=list[PaymentTransaction])
async def list_payment_transactions(
    payment_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> list[dict]:
    return service.fetch_payment_transactions(user, payment_id)


@router.patch("/{payment_id}/received", response_model=Payment)
async def mark_received(payment_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return service.mark_payment_received(user, payment_id)


@router.patch("/{payment_id}/failed", response_model=Payment)
async def mark_failed(
    payment_id: str,
    request: MarkPaymentFailedRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return service.mark_payment_failed(user, payment_id, request.reason)
