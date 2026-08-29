from typing import Literal

from pydantic import BaseModel

OrderStatus = Literal[
    "pending", "confirmed", "processing", "ready", "completed", "cancelled", "rejected",
    "payment_failed", "disputed", "refunded",
]


class CartItemInput(BaseModel):
    listing_id: str
    quantity: int


class CheckoutRequest(BaseModel):
    cart_items: list[CartItemInput]
    delivery_charge_by_seller: dict[str, float] = {}


class UpdateOrderStatusRequest(BaseModel):
    to: OrderStatus


class ProfileRef(BaseModel):
    id: str
    full_name: str


class ListingRef(BaseModel):
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
    listing: ListingRef | None = None


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


class OrderWithItems(Order):
    order_items: list[OrderItemWithListing] = []
    buyer: ProfileRef | None = None
    seller: ProfileRef | None = None


class OrderStatusHistoryEntry(BaseModel):
    id: str
    order_id: str
    from_status: OrderStatus | None
    to_status: OrderStatus
    changed_by: str | None
    created_at: str
