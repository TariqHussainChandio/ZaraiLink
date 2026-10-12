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


class CartItemInput(BaseModel):
    listing_id: str
    quantity: int


class CheckoutRequest(BaseModel):
    cart_items: list[CartItemInput]
    delivery_charge_by_seller: dict[str, float] = {}


class UpdateOrderStatusRequest(BaseModel):
    to: OrderStatus


class OrderProfileRef(BaseModel):
    id: str
    full_name: str


class OrderListingRef(BaseModel):
    title: str
    unit: str


class OrderItem(BaseModel):
    id: str
    order_id: str
    listing_id: str | None
    quantity: float
    unit_price: float
    created_at: str


class OrderItemWithListing(OrderItem):
    listing: OrderListingRef | None = None


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
    # platform holds no money (BR-11), so a cancellation moves none: any refund is settled between buyer and seller.
    admin_action_reason: str | None = None


class OrderWithItems(Order):
    order_items: list[OrderItemWithListing] = []
    buyer: OrderProfileRef | None = None
    seller: OrderProfileRef | None = None


class OrderStatusHistoryEntry(BaseModel):
    id: str
    order_id: str
    from_status: OrderStatus | None
    to_status: OrderStatus
    changed_by: str | None
    created_at: str


class AdminCancelOrderRequest(BaseModel):
    # guard_orders_update refuses an admin cancellation without a reason (23514); trimmed and required here too.
    reason: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
