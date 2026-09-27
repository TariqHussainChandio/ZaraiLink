from typing import Literal

from pydantic import BaseModel

PaymentStatus = Literal["pending", "processing", "successful", "failed", "cancelled", "refunded"]
PaymentMethod = Literal["cod", "bank_transfer"]


class InitiatePaymentRequest(BaseModel):
    order_id: str
    method: PaymentMethod
    # Deliberately no `amount` field — see payments_service.initiate_payment's docstring.


class MarkPaymentFailedRequest(BaseModel):
    reason: str | None = None


class Payment(BaseModel):
    id: str
    order_id: str
    buyer_id: str
    amount: float
    currency: str
    method: str
    provider: str
    provider_transaction_ref: str | None
    status: PaymentStatus
    created_at: str
    updated_at: str


class PaymentTransaction(BaseModel):
    id: str
    payment_id: str
    event_type: str
    payload: dict | None = None
    created_at: str
