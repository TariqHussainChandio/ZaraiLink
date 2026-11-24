"""Payment request and response shapes (no escrow or wallet, BR-11)."""

from typing import Literal

from pydantic import BaseModel

PaymentStatus = Literal["pending", "processing", "successful", "failed", "cancelled", "refunded"]
PaymentMethod = Literal["cod", "bank_transfer"]


# Body for starting a payment: the order and the method.
class InitiatePaymentRequest(BaseModel):
    order_id: str
    method: PaymentMethod
    # Deliberately no `amount` field — see payments_service.initiate_payment's docstring.


# Body for marking a payment as failed.
class MarkPaymentFailedRequest(BaseModel):
    reason: str | None = None


# One payment row.
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


# One event in a payment's history.
class PaymentTransaction(BaseModel):
    id: str
    payment_id: str
    event_type: str
    payload: dict | None = None
    created_at: str
