"""P5 (item 4): RFC 9457 (`application/problem+json`) error responses, registered once at the
FastAPI level. Every existing `raise HTTPException(status_code=..., detail=...)` call site across
the service layer needs no change — FastAPI's own exception handling already routes every
HTTPException through whichever handler is registered for it, so swapping the handler reshapes
every response without touching the ~17 files that raise them."""

import logging
from collections.abc import Mapping
from typing import cast

import sentry_sdk
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from postgrest.exceptions import APIError
from pydantic import BaseModel
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.common.errors import default_code
from app.middleware.request_context import request_id_var

logger = logging.getLogger(__name__)


class FieldError(BaseModel):
    loc: list[str | int]
    msg: str


class ProblemDetail(BaseModel):
    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None
    code: str
    errors: list[FieldError] | None = None


def problem_response(
    status_code: int,
    title: str,
    detail: str | None = None,
    instance: str | None = None,
    headers: Mapping[str, str] | None = None,
    code: str | None = None,
    errors: list[FieldError] | None = None,
) -> JSONResponse:
    body = ProblemDetail(
        title=title,
        status=status_code,
        detail=detail,
        instance=instance,
        code=code or default_code(status_code),
        errors=errors,
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(exclude_none=True),
        media_type="application/problem+json",
        headers=headers,
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # Starlette's `add_exception_handler` types every handler as `Callable[[Request, Exception],
    # ...]` (a callback parameter is contravariant, so a handler can't be typed to accept only a
    # subtype). Starlette itself only ever calls this handler for the exact class it was
    # registered against in main.py, so `cast` here is a pure static-type narrowing with no
    # runtime check needed — not a suppression, just telling mypy what's already guaranteed.
    exc = cast(StarletteHTTPException, exc)
    return problem_response(
        status_code=exc.status_code,
        title=str(exc.detail),
        instance=request.url.path,
        headers=exc.headers,
        code=getattr(exc, "code", None),
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(RequestValidationError, exc)
    # The offending input is dropped on purpose: it can hold a password or a token, and `loc` and `msg` are what a
    # form needs to highlight the right field.
    errors = [FieldError(loc=[*error["loc"]], msg=str(error["msg"])) for error in exc.errors()]
    return problem_response(
        status_code=422,
        title="Request validation failed",
        instance=request.url.path,
        code="validation_failed",
        errors=errors,
    )


async def rate_limit_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(RateLimitExceeded, exc)
    return problem_response(
        status_code=429,
        title="Too many requests",
        detail=str(exc.detail),
        instance=request.url.path,
        headers={"Retry-After": "60"},
        code="rate_limited",
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    # This is the last resort — anything that reaches here is a real bug, not an expected 4xx, so
    # it's logged with the full traceback (request-id-tagged, via the JSON formatter reading the
    # same contextvar) and never shown to the client, which only ever sees a generic message.
    logger.error(
        "Unhandled exception on %s %s (request_id=%s)",
        request.method,
        request.url.path,
        request_id_var.get(),
        exc_info=exc,
    )
    sentry_sdk.capture_exception(exc)  # no-op unless SENTRY_DSN is set; Sentry de-duplicates the re-raise
    return problem_response(status_code=500, title="Internal server error", instance=request.url.path)


# A database error that reaches the API boundary is almost always the caller's input, not our bug: a malformed id, a
# reference to a row that does not exist, a value outside a column's rules, or a row-level-security refusal. Found by
# the property-based contract test (test_smoke_schemathesis.py): before this, a path id such as "0" made PostgREST
# raise 22P02 and the client got a 500 with no way to tell it from a real failure. Anything not listed stays a 500.
_DATABASE_ERRORS: dict[str, tuple[int, str]] = {
    "22P02": (422, "A value has the wrong format"),
    "22003": (422, "A number is out of range"),
    "22007": (422, "A date or time has the wrong format"),
    "22008": (422, "A date or time is out of range"),
    "22023": (422, "A value is not allowed"),
    "22001": (422, "A value is too long"),
    "23502": (422, "A required value is missing"),
    "23514": (422, "A value breaks a rule of the data"),
    "23503": (409, "This refers to something that does not exist, or is still in use"),
    "23505": (409, "This already exists"),
    "42501": (403, "You are not allowed to do this"),
    "22P05": (422, "A value contains a character that cannot be stored"),
    "22021": (422, "A value contains a character that cannot be stored"),
    "PGRST204": (422, "An unknown field was sent"),
    "PGRST100": (422, "A filter value could not be understood"),
    "PGRST102": (422, "There is nothing to update"),
    "PGRST103": (422, "That page of results does not exist"),
    "PGRST116": (404, "Not found"),
}


async def database_error_handler(request: Request, exc: Exception) -> JSONResponse:
    exc = cast(APIError, exc)
    mapped = _DATABASE_ERRORS.get(str(exc.code))
    if mapped is None:
        return await unhandled_exception_handler(request, exc)
    status_code, title = mapped
    return problem_response(status_code=status_code, title=title, instance=request.url.path)
