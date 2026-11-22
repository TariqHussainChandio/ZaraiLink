"""errors.stock_errors: the stock functions' SQLSTATEs as the API answers them, with the function's own message."""

import pytest
from postgrest.exceptions import APIError

from app.common.errors import AppHTTPException
from app.inventory.errors import stock_errors


def _raise(code: str, message: str | None = "From the function") -> None:
    with stock_errors():
        raise APIError({"code": code, "message": message, "details": None, "hint": None})


@pytest.mark.parametrize(
    ("sqlstate", "status", "code"),
    [
        ("P0001", 422, "insufficient_stock"),
        ("22023", 422, "validation_failed"),
        ("42501", 403, "forbidden"),
        ("P0002", 404, "not_found"),
    ],
)
def test_each_stock_function_error_has_its_status_and_code(sqlstate, status, code):
    with pytest.raises(AppHTTPException) as caught:
        _raise(sqlstate, "Only 3 in stock at this location")
    assert caught.value.status_code == status
    assert caught.value.code == code
    # the function's own words reach the dealer: they say what to correct
    assert caught.value.detail == "Only 3 in stock at this location"


def test_an_error_without_a_message_gets_a_plain_one():
    with pytest.raises(AppHTTPException) as caught:
        _raise("P0001", None)
    assert caught.value.detail == "The stock change was refused"


@pytest.mark.parametrize("sqlstate", ["23505", "23503", "22P02", "PGRST116", None])
def test_any_other_database_error_is_left_to_the_global_map(sqlstate):
    with pytest.raises(APIError) as caught:
        _raise(sqlstate)
    assert caught.value.code == sqlstate


def test_a_non_database_error_passes_through_untouched():
    with pytest.raises(ValueError, match="boom"), stock_errors():
        raise ValueError("boom")


def test_no_error_means_no_change():
    with stock_errors():
        result = 1 + 1
    assert result == 2
