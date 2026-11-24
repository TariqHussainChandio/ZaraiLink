"""Order request and response shapes."""

from typing import Annotated, Literal

from pydantic import BaseModel, StringConstraints

OrderStatus = Literal[
    "pending",
    "confirmed",
    "processing",
    "ready",
    "dispatched",
    "completed",
    "cancelled",
    "rejected",
    "payment_failed",
    "disputed",
    "refunded",
    "expired",
]


# One cart line sent at checkout.
class CartItemInput(BaseModel):
    listing_id: str
    quantity: int


# Body for checkout: the cart lines and each seller's delivery charge (BR-09).
class CheckoutRequest(BaseModel):
    cart_items: list[CartItemInput]
    delivery_charge_by_seller: dict[str, float] = {}


# Body for changing an order's status.
class UpdateOrderStatusRequest(BaseModel):
    to: OrderStatus
    # Only for the admin settling a dispute (SRDS §14), where it is required and stored on the order as
    # admin_action_reason for both parties to read; anyone else sending one is refused (422 validation_failed).
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)] | None = None


# A short profile reference (buyer or seller).
class OrderProfileRef(BaseModel):
    id: str
    full_name: str


# A short listing reference shown on an order item.
class OrderListingRef(BaseModel):
    title: str
    unit: str


# One item of an order.
class OrderItem(BaseModel):
    id: str
    order_id: str
    listing_id: str | None
    quantity: float
    unit_price: float
    created_at: str


# An order item with its listing attached.
class OrderItemWithListing(OrderItem):
    listing: OrderListingRef | None = None


# One order row as stored.
class Order(BaseModel):
    id: str
    buyer_id: str
    seller_id: str
    status: OrderStatus
    product_subtotal: float
    delivery_charge: float
    total: float
    created_at: str
    updated_at: str
    # Why an admin cancelled the order or resolved its dispute (SRDS §14); null for every participant's move. The
    # platform holds no money (BR-11), so a cancellation moves none: money already paid is settled by buyer and seller.
    admin_action_reason: str | None = None


# An order with its items, buyer and seller attached.
class OrderWithItems(Order):
    order_items: list[OrderItemWithListing] = []
    buyer: OrderProfileRef | None = None
    seller: OrderProfileRef | None = None


# One entry of an order's status history.
class OrderStatusHistoryEntry(BaseModel):
    id: str
    order_id: str
    from_status: OrderStatus | None
    to_status: OrderStatus
    changed_by: str | None
    created_at: str


# Body for an admin cancelling an order, with a reason.
class AdminCancelOrderRequest(BaseModel):
    # guard_orders_update refuses an admin cancellation without a reason (23514); trimmed and required here too.
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
