"""P7 (7B): the stable error codes of the API.

Every error response is RFC 9457 problem+json (core/problem_details.py) and carries a `code`: a short machine-readable
identifier the mobile app maps to its own message and to behaviour (a suspended account, an expired session, a
rate limit). `title` stays English text for logs and developers; clients must never parse it.

Most errors get a code from their HTTP status alone (DEFAULT_CODES). A handful the app must tell apart from their
status siblings raise `AppHTTPException` with a specific code instead.
"""

from typing import Literal, get_args

from fastapi import HTTPException

ErrorCode = Literal[
    "bad_request",
    "unauthenticated",
    "token_invalid",
    "auth_unavailable",
    "account_suspended",
    "insufficient_role",
    "mfa_required",
    "incorrect_password",
    "forbidden",
    "not_found",
    "conflict",
    "idempotency_in_progress",
    "idempotency_key_reused",
    "payload_too_large",
    "validation_failed",
    "insufficient_stock",
    "listing_unavailable",
    "invalid_transition",
    "rate_limited",
    "service_unavailable",
    "server_error",
]

ERROR_CODES: tuple[str, ...] = get_args(ErrorCode)

DEFAULT_CODES: dict[int, ErrorCode] = {
    400: "bad_request",
    401: "unauthenticated",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    413: "payload_too_large",
    422: "validation_failed",
    429: "rate_limited",
    503: "service_unavailable",
}


def default_code(status_code: int) -> ErrorCode:
    if status_code in DEFAULT_CODES:
        return DEFAULT_CODES[status_code]
    return "server_error" if status_code >= 500 else "bad_request"


class AppHTTPException(HTTPException):
    """An HTTPException that names its error code, for the cases the app must distinguish."""

    def __init__(self, status_code: int, detail: str, code: ErrorCode, headers: dict[str, str] | None = None) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=headers)
        self.code = code
