"""Suppliers and purchases (B2 sub-lane; SRDS §17): the dealer's own supplier list, and purchase/restock records that
stay editable while a draft and move stock only when received (receive_purchase writes one PURCHASE movement per line,
SRDS §24). Suppliers are internal records, never marketplace accounts.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.common.errors import AppHTTPException
from app.common.pagination import Page, paginate
from app.inventory import repository as repo
from app.inventory.errors import stock_errors
from app.inventory.idempotent import idempotency_key, run_once
from app.inventory.schemas import (
    Purchase,
    PurchaseInput,
    PurchaseStatus,
    PurchaseUpdateInput,
    Supplier,
    SupplierInput,
    SupplierUpdateInput,
)

SUPPLIERS = "inventory_suppliers"

router = APIRouter()


# --- service: suppliers -----------------------------------------------------------------------------------------------


async def list_suppliers(user: AuthenticatedUser, include_inactive: bool = True) -> list[dict]:
    return await repo.list_active_or_all(user.access_token, SUPPLIERS, include_inactive)


async def get_supplier(user: AuthenticatedUser, supplier_id: str) -> dict:
    supplier = await repo.fetch_row(user.access_token, SUPPLIERS, supplier_id)
    if supplier is None:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


async def create_supplier(user: AuthenticatedUser, fields: dict) -> dict:
    return await repo.create_row(user.access_token, SUPPLIERS, user.id, fields)


async def update_supplier(user: AuthenticatedUser, supplier_id: str, fields: dict) -> dict:
    if not fields:
        return await get_supplier(user, supplier_id)
    return await repo.update_row(user.access_token, SUPPLIERS, supplier_id, fields)


async def delete_supplier(user: AuthenticatedUser, supplier_id: str) -> None:
    # A purchase keeps its record when its supplier goes (supplier_id is `on delete set null`).
    await get_supplier(user, supplier_id)
    await repo.delete_row(user.access_token, SUPPLIERS, supplier_id)


# --- service: purchases -----------------------------------------------------------------------------------------------


async def list_purchases(user: AuthenticatedUser, status: str | None = None) -> list[dict]:
    return await repo.fetch_purchases(user.access_token, status)


async def get_purchase(user: AuthenticatedUser, purchase_id: str) -> dict:
    purchase = await repo.fetch_purchase(user.access_token, purchase_id)
    if purchase is None:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return purchase


async def _get_draft(user: AuthenticatedUser, purchase_id: str) -> dict:
    purchase = await get_purchase(user, purchase_id)
    if purchase["status"] != "draft":
        raise AppHTTPException(409, f"This purchase is already {purchase['status']}", "invalid_transition")
    return purchase


# The refusal create_purchase and replace_purchase_items make for another dealer's supplier, product or location (42501,
# which errors.stock_errors answers 403 forbidden with this message).
NOT_YOURS = "A purchase must use your own supplier, products and locations"


async def _refused_as_transition(user: AuthenticatedUser, purchase_id: str, exc: AppHTTPException) -> None:
    """A 22023 from a purchase function is either a figure or shape the dealer must fix, or "This purchase is already
    received|cancelled" when another request changed its status after this one read the draft. The status is read
    again rather than the message parsed: if it is no draft any more, the dealer hears the 409 invalid_transition that
    a later edit, cancel or receive would answer."""
    if exc.code == "validation_failed":
        await _get_draft(user, purchase_id)


def _purchase_fields(fields: dict) -> dict:
    # purchased_on left out takes the table's default (today); sent as null it would break the not-null column.
    return {k: v for k, v in fields.items() if k != "items" and not (k == "purchased_on" and v is None)}


async def create_purchase(user: AuthenticatedUser, fields: dict) -> dict:
    """A draft with its lines, in one transaction (create_purchase). The function refuses a supplier, product or
    location of another dealer (403) or an inactive location (422), and a refusal writes nothing."""
    with stock_errors():
        purchase_id = await repo.create_purchase(user.access_token, _purchase_fields(fields), fields.get("items") or [])
    return await get_purchase(user, purchase_id)


async def update_purchase(user: AuthenticatedUser, purchase_id: str, fields: dict) -> dict:
    """Edits a draft. With `items`, the lines and the header changes are one replace_purchase_items call under the
    purchase's row lock, so concurrent edits cannot double the lines and a receive cannot see a half-edited draft
    (B2 verification F1/F2). Without, the header is one plain update the draft-only policy guards."""
    await _get_draft(user, purchase_id)
    header = _purchase_fields(fields)
    try:
        with stock_errors():
            if fields.get("items") is not None:
                await repo.replace_purchase_items(user.access_token, purchase_id, fields["items"], header or None)
            elif header:
                await repo.update_purchase(user.access_token, purchase_id, header)
    except AppHTTPException as exc:
        await _refused_as_transition(user, purchase_id, exc)
        raise
    return await get_purchase(user, purchase_id)


async def receive_purchase(user: AuthenticatedUser, purchase_id: str) -> dict:
    """Moves the stock in, one PURCHASE movement per line, in one transaction. A purchase that is no longer a draft is
    409 invalid_transition, as edit and cancel answer (B2 verification F8): receiving is a status change. Two receives
    racing both pass the read; receive_purchase lets one through and refuses the other (22023), which is told the same
    409. An empty draft stays 422: that is a value the dealer must fix, not a status."""
    await _get_draft(user, purchase_id)
    try:
        with stock_errors():
            await repo.receive_purchase(user.access_token, purchase_id)
    except AppHTTPException as exc:
        await _refused_as_transition(user, purchase_id, exc)
        raise
    return await get_purchase(user, purchase_id)


async def cancel_purchase(user: AuthenticatedUser, purchase_id: str) -> dict:
    # Only a draft can be cancelled: a received purchase already moved stock, which only a movement can undo.
    await _get_draft(user, purchase_id)
    await repo.update_purchase(user.access_token, purchase_id, {"status": "cancelled"})
    return await get_purchase(user, purchase_id)


# --- routes: suppliers ------------------------------------------------------------------------------------------------


@router.get("/suppliers", response_model=list[Supplier])
async def get_suppliers(
    include_inactive: bool = True, user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await list_suppliers(user, include_inactive))


@router.post("/suppliers", response_model=Supplier, status_code=201)
async def post_supplier(request: SupplierInput, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await create_supplier(user, request.model_dump())


@router.get("/suppliers/{supplier_id}", response_model=Supplier)
async def get_one_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await get_supplier(user, supplier_id)


@router.patch("/suppliers/{supplier_id}", response_model=Supplier)
async def patch_supplier(
    supplier_id: str, request: SupplierUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await update_supplier(user, supplier_id, request.model_dump(exclude_unset=True))


@router.delete("/suppliers/{supplier_id}", status_code=204)
async def remove_supplier(supplier_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> None:
    await delete_supplier(user, supplier_id)


# --- routes: purchases ------------------------------------------------------------------------------------------------


@router.get("/purchases", response_model=list[Purchase])
async def get_purchases(
    status: PurchaseStatus | None = None,
    user: AuthenticatedUser = Depends(require_dealer),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await list_purchases(user, status))


@router.post("/purchases", response_model=Purchase, status_code=201)
async def post_purchase(
    request: PurchaseInput,
    user: AuthenticatedUser = Depends(require_dealer),
    key: str | None = Depends(idempotency_key),
) -> dict:
    # An optional Idempotency-Key makes a retried create record the purchase once (idempotent.py). mode="json" sends
    # purchased_on as ISO text, which is what PostgREST takes.
    return await run_once(
        user,
        key,
        "inventory.purchase_create",
        request,
        201,
        lambda: create_purchase(user, request.model_dump(mode="json")),
    )


@router.get("/purchases/{purchase_id}", response_model=Purchase)
async def get_one_purchase(purchase_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await get_purchase(user, purchase_id)


@router.patch("/purchases/{purchase_id}", response_model=Purchase)
async def patch_purchase(
    purchase_id: str, request: PurchaseUpdateInput, user: AuthenticatedUser = Depends(require_dealer)
) -> dict:
    return await update_purchase(user, purchase_id, request.model_dump(mode="json", exclude_unset=True))


@router.post("/purchases/{purchase_id}/receive", response_model=Purchase)
async def post_receive_purchase(purchase_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await receive_purchase(user, purchase_id)


@router.post("/purchases/{purchase_id}/cancel", response_model=Purchase)
async def post_cancel_purchase(purchase_id: str, user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await cancel_purchase(user, purchase_id)
