"""The inventory request rules (schemas.py): finite, positive, two-decimal quantities; reasons where the ledger needs
one. The database refuses the same values (B1); refusing them here gives the dealer a field error instead of a rounded
figure or a database message."""

import math
from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.inventory.schemas import (
    AdjustmentInput,
    AlertSettingsInput,
    LocationInput,
    LocationUpdateInput,
    MovementInput,
    ProductInput,
    ProductUpdateInput,
    PurchaseInput,
    PurchaseItemInput,
    PurchaseUpdateInput,
    StockInInput,
    StockOutInput,
    SupplierInput,
    SupplierUpdateInput,
    TransferInput,
)
from app.main import app

IDS = {"product_id": "p", "location_id": "l"}
QUANTITY_MODELS = [
    (StockInInput, IDS),
    (StockOutInput, {**IDS, "source": "LOCAL_SALE"}),
    (AdjustmentInput, {**IDS, "direction": "in", "reason": "Count"}),
    (TransferInput, {"product_id": "p", "from_location_id": "a", "to_location_id": "b"}),
    (PurchaseItemInput, IDS),
    (MovementInput, {**IDS, "direction": "out", "source": "LOCAL_SALE"}),
]


@pytest.mark.parametrize(("model", "rest"), QUANTITY_MODELS)
@pytest.mark.parametrize("quantity", [0.01, 1, 2.5, 1.25, 9_999_999_999.99])
def test_a_positive_two_decimal_quantity_is_accepted(model, rest, quantity):
    assert model(**rest, quantity=quantity).quantity == quantity


@pytest.mark.parametrize(("model", "rest"), QUANTITY_MODELS)
@pytest.mark.parametrize(
    "quantity",
    [0, -1, -0.01, 1.255, 0.001, 2.505, 10_000_000_000, math.nan, math.inf, -math.inf, "NaN", "Infinity"],
)
def test_a_quantity_that_is_not_positive_finite_and_two_decimal_is_refused(model, rest, quantity):
    with pytest.raises(ValidationError):
        model(**rest, quantity=quantity)


@pytest.mark.parametrize("field", ["cost_price", "selling_price", "reorder_threshold"])
@pytest.mark.parametrize("value", [-0.01, 10.555, math.nan, math.inf, 10_000_000_000])
def test_a_price_or_threshold_is_refused_rather_than_rounded(field, value):
    with pytest.raises(ValidationError):
        ProductInput(sku="S", name="N", **{field: value})
    with pytest.raises(ValidationError):
        ProductUpdateInput(**{field: value})


@pytest.mark.parametrize("field", ["cost_price", "selling_price", "reorder_threshold"])
def test_a_price_or_threshold_of_zero_or_two_decimals_is_kept(field):
    assert getattr(ProductInput(sku="S", name="N", **{field: 0}), field) == 0
    assert getattr(ProductUpdateInput(**{field: 12.34}), field) == 12.34


def test_a_purchase_line_cost_and_the_alert_default_follow_the_same_rule():
    assert PurchaseItemInput(**IDS, quantity=1, unit_cost=0).unit_cost == 0
    for bad in (-1, 1.001, math.nan):
        with pytest.raises(ValidationError):
            PurchaseItemInput(**IDS, quantity=1, unit_cost=bad)
        with pytest.raises(ValidationError):
            AlertSettingsInput(default_reorder_threshold=bad)


def test_a_product_needs_a_sku_a_name_and_a_unit():
    assert ProductInput(sku="S", name="N").unit == "unit"
    for bad in ({"sku": ""}, {"name": ""}, {"unit": ""}):
        with pytest.raises(ValidationError):
            ProductInput(**{"sku": "S", "name": "N", **bad})


@pytest.mark.parametrize("source", ["DAMAGE", "EXPIRY", "OTHER"])
def test_a_loss_or_own_use_needs_a_reason(source):
    for reason in (None, "", "   "):
        with pytest.raises(ValidationError):
            StockOutInput(**IDS, source=source, quantity=1, reason=reason)
    assert StockOutInput(**IDS, source=source, quantity=1, reason="Torn bag").reason == "Torn bag"


def test_a_local_sale_needs_no_reason_and_stock_out_takes_only_its_four_sources():
    assert StockOutInput(**IDS, source="LOCAL_SALE", quantity=1).reason is None
    for source in ("RESTOCK", "PURCHASE", "TRANSFER", "ZARAILINK_ORDER", "MANUAL_ADJUSTMENT"):
        with pytest.raises(ValidationError):
            StockOutInput(**IDS, source=source, quantity=1, reason="x")


def test_an_adjustment_needs_a_reason_with_something_in_it():
    for reason in ("", "   "):
        with pytest.raises(ValidationError):
            AdjustmentInput(**IDS, direction="in", quantity=1, reason=reason)


def test_a_manual_movement_cannot_claim_a_source_with_its_own_flow():
    for source in ("ZARAILINK_ORDER", "PURCHASE", "TRANSFER"):
        with pytest.raises(ValidationError):
            MovementInput(**IDS, direction="in", source=source, quantity=1)


DEALER = AuthenticatedUser(id="dealer-1", email="d@x.com", role="dealer", access_token="tok")


@pytest.mark.parametrize("literal", ["NaN", "Infinity", "-Infinity", "1e400"])
def test_non_json_numbers_in_a_request_body_are_refused_before_any_database_call(literal):
    """Python's JSON reader accepts NaN and Infinity (and reads 1e400 as infinity); they must stop at the schema, not
    reach the database as a value PostgREST cannot even encode."""
    app.dependency_overrides[get_current_user] = lambda: DEALER
    try:
        response = TestClient(app).post(
            "/api/v1/inventory/movements/stock-in",
            content=f'{{"product_id": "p", "location_id": "l", "quantity": {literal}}}',
            headers={"Content-Type": "application/json"},
        )
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 422, response.text
    assert response.json()["code"] == "validation_failed"


# --- F6: a purchase date is a real, plausible day ---------------------------------------------------------------------


@pytest.mark.parametrize("model", [PurchaseInput, PurchaseUpdateInput])
@pytest.mark.parametrize("value", ["infinity", "-infinity", "epoch", "today", "0001-01-01", "1999-12-31", "2026-13-01"])
def test_a_purchase_date_that_is_not_a_plausible_day_is_refused(model, value):
    with pytest.raises(ValidationError):
        model(purchased_on=value)


@pytest.mark.parametrize("model", [PurchaseInput, PurchaseUpdateInput])
def test_a_purchase_date_from_2000_to_a_year_ahead_is_kept(model):
    today = datetime.now(UTC).date()
    for day in (date(2000, 1, 1), today, today + timedelta(days=365)):
        assert model(purchased_on=day.isoformat()).purchased_on == day
    with pytest.raises(ValidationError):
        model(purchased_on=(today + timedelta(days=366)).isoformat())
    assert model().purchased_on is None


def test_a_purchase_date_leaves_python_as_iso_text():
    assert PurchaseInput(purchased_on="2026-10-01").model_dump(mode="json")["purchased_on"] == "2026-10-01"


# --- F8: free text has a length cap -----------------------------------------------------------------------------------

LONG = "x" * 1_000_001
TEXT_FIELDS = [
    (ProductInput, {"sku": "S", "name": "N"}, ["sku", "name", "unit"]),
    (ProductUpdateInput, {}, ["sku", "name", "unit"]),
    (LocationInput, {"name": "N"}, ["name", "address"]),
    (LocationUpdateInput, {}, ["name", "address"]),
    (SupplierInput, {"name": "N"}, ["name", "contact", "products_supplied", "notes"]),
    (SupplierUpdateInput, {}, ["name", "contact", "products_supplied", "notes"]),
    (PurchaseInput, {}, ["reference", "notes"]),
    (PurchaseUpdateInput, {}, ["reference", "notes"]),
    (StockInInput, {**IDS, "quantity": 1}, ["reason"]),
    (StockOutInput, {**IDS, "quantity": 1, "source": "LOCAL_SALE"}, ["reason"]),
    (AdjustmentInput, {**IDS, "quantity": 1, "direction": "in", "reason": "Count"}, ["reason"]),
    (TransferInput, {"product_id": "p", "from_location_id": "a", "to_location_id": "b", "quantity": 1}, ["reason"]),
    (MovementInput, {**IDS, "quantity": 1, "direction": "in", "source": "RESTOCK"}, ["reason"]),
]


@pytest.mark.parametrize(("model", "base", "fields"), TEXT_FIELDS, ids=lambda v: getattr(v, "__name__", ""))
def test_free_text_over_its_cap_is_refused(model, base, fields):
    for field in fields:
        with pytest.raises(ValidationError):
            model(**{**base, field: LONG})


@pytest.mark.parametrize(
    ("model", "base", "field", "cap"),
    [
        (ProductInput, {"sku": "S", "name": "N"}, "name", 120),
        (ProductInput, {"sku": "S", "name": "N"}, "sku", 120),
        (PurchaseInput, {}, "reference", 80),
        (PurchaseInput, {}, "notes", 1000),
        (StockInInput, {**IDS, "quantity": 1}, "reason", 1000),
    ],
)
def test_free_text_at_its_cap_is_kept(model, base, field, cap):
    assert getattr(model(**{**base, field: "y" * cap}), field) == "y" * cap
    with pytest.raises(ValidationError):
        model(**{**base, field: "y" * (cap + 1)})


def test_the_legacy_bodies_cap_their_free_text_too():
    from app.dealer.schemas import (
        AdjustStockRequest,
        InventoryInput,
        InventoryUpdateInput,
        StoreInput,
        StoreUpdateInput,
    )
    from app.dealer.schemas import SupplierInput as LegacySupplierInput
    from app.dealer.schemas import SupplierUpdateInput as LegacySupplierUpdateInput

    base = {"listing_id": None, "stock_quantity": 1, "unit": "bag", "min_stock_threshold": 0}
    cases = [
        (InventoryInput, base, "unit"),
        (InventoryUpdateInput, {}, "unit"),
        (AdjustStockRequest, {"type": "sale", "quantity": 1}, "notes"),
        (StoreInput, {"name": "N"}, "name"),
        (StoreInput, {"name": "N"}, "address"),
        (StoreUpdateInput, {}, "contact"),
        (LegacySupplierInput, {"name": "N"}, "notes"),
        (LegacySupplierUpdateInput, {}, "name"),
    ]
    for model, rest, field in cases:
        with pytest.raises(ValidationError):
            model(**{**rest, field: LONG})


@pytest.mark.parametrize("model", [PurchaseInput, PurchaseUpdateInput])
def test_a_purchase_has_at_most_200_lines_as_the_database_holds(model):
    line = {**IDS, "quantity": 1}
    assert len(model(items=[line] * 200).items or []) == 200
    with pytest.raises(ValidationError):
        model(items=[line] * 201)
