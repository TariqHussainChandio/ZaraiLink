from fastapi import APIRouter, Depends, Header

from ....core import idempotency
from ....core.auth import AuthenticatedUser, require_authenticated_user
from ....core.pagination import Page, paginate
from ....schemas.payments import InitiatePaymentRequest, MarkPaymentFailedRequest, Payment, PaymentTransaction
from ....services import payments_service as service

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])


@router.post("", response_model=Payment)
async def initiate_payment(
    request: InitiatePaymentRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dict:
    claim = await idempotency.begin(user, idempotency_key, "payments.initiate", idempotency.fingerprint(request))
    if claim and claim.replay is not None:
        return claim.replay
    finished = False
    try:
        payment = await service.initiate_payment(user, request.order_id, request.method)
        if claim:
            await claim.complete(200, payment)
        finished = True
        return payment
    finally:
        if claim and not finished:
            await claim.abandon()


@router.get("/{payment_id}", response_model=Payment)
async def get_payment(payment_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return await service.fetch_payment_by_id(user, payment_id)


@router.get("/by-order/{order_id}", response_model=Payment | None)
async def get_payment_by_order(
    order_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)
) -> dict | None:
    return await service.fetch_payment_by_order_id(user, order_id)


@router.get("/{payment_id}/transactions", response_model=list[PaymentTransaction])
async def list_payment_transactions(
    payment_id: str, user: AuthenticatedUser = Depends(require_authenticated_user), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_payment_transactions(user, payment_id))


@router.patch("/{payment_id}/received", response_model=Payment)
async def mark_received(payment_id: str, user: AuthenticatedUser = Depends(require_authenticated_user)) -> dict:
    return await service.mark_payment_received(user, payment_id)


@router.patch("/{payment_id}/failed", response_model=Payment)
async def mark_failed(
    payment_id: str,
    request: MarkPaymentFailedRequest,
    user: AuthenticatedUser = Depends(require_authenticated_user),
) -> dict:
    return await service.mark_payment_failed(user, payment_id, request.reason)
