"""P7 (7A): database errors that are really bad input become 4xx problem+json responses, and an update that matched
nothing is a 404. Both were 500s until the property-based contract test found them (test_smoke_schemathesis.py)."""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.core.problem_details import database_error_handler, http_exception_handler, unhandled_exception_handler
from app.core.rows import first_row


def _client(raises: Exception) -> TestClient:
    app = FastAPI()
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(APIError, database_error_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.get("/boom")
    def boom() -> None:
        raise raises

    return TestClient(app, raise_server_exceptions=False)


def _database_error(code: str) -> APIError:
    return APIError({"message": "boom", "code": code, "hint": None, "details": None})


@pytest.mark.parametrize(
    ("code", "status"),
    [
        ("22P02", 422),  # a malformed uuid in a path or body
        ("22P05", 422),  # a NUL character
        ("23503", 409),  # a reference to something that does not exist
        ("23505", 409),  # already exists
        ("42501", 403),  # row-level security refused it
        ("PGRST100", 422),  # an unparseable filter
        ("PGRST102", 422),  # an empty update body
        ("PGRST116", 404),  # no such row
    ],
)
def test_a_database_error_caused_by_the_callers_input_is_a_4xx_problem(code, status):
    response = _client(_database_error(code)).get("/boom")
    assert response.status_code == status
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["status"] == status


def test_an_unrecognised_database_error_is_still_a_500():
    response = _client(_database_error("XX000")).get("/boom")
    assert response.status_code == 500


def test_first_row_of_an_update_that_matched_nothing_is_a_404():
    with pytest.raises(HTTPException) as caught:
        first_row(SimpleNamespace(data=[]))
    assert caught.value.status_code == 404
