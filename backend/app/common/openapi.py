"""P7 (7A): make the published OpenAPI document describe the API a client actually sees.

FastAPI's generated spec is close, but the mobile client is generated from it, so three things must be true that
FastAPI does not do on its own:

- readable operation ids (`orders_list_orders`, not `list_orders_api_v1_orders_get`), through
  `generate_unique_id_function`;
- authentication described as a bearer scheme applied to the operations that need it, not as an optional
  `Authorization` header parameter on every call (the header is read by `auth/dependencies.py:get_bearer_token`, which
  deliberately takes it as an optional header so a missing token is our own 401, not FastAPI's 422);
- the responses the code really produces but FastAPI cannot infer: the problem+json error body (with a stable
  `code`), the `Link` header on paginated lists, and the `X-Request-ID` header on every response.
"""

from typing import Any, cast

from fastapi import FastAPI
from fastapi.routing import APIRoute

from app.common.errors import ERROR_CODES

BEARER = "bearerAuth"

PROBLEM_SCHEMA: dict[str, Any] = {
    "title": "ProblemDetail",
    "description": "RFC 9457 problem details. `code` is a stable machine-readable identifier; `title` is English text.",
    "type": "object",
    "required": ["type", "title", "status", "code"],
    "properties": {
        "type": {"type": "string", "default": "about:blank"},
        "title": {"type": "string"},
        "status": {"type": "integer"},
        "detail": {"type": ["string", "null"]},
        "instance": {"type": ["string", "null"]},
        "code": {"type": "string", "enum": list(ERROR_CODES)},
        "errors": {
            "type": ["array", "null"],
            "items": {
                "type": "object",
                "properties": {
                    "loc": {"type": "array", "items": {"type": ["string", "integer"]}},
                    "msg": {"type": "string"},
                },
            },
        },
    },
}


def operation_id(route: APIRoute) -> str:
    """`<tag>_<function name>`, unique because a router never defines two handlers with one name."""
    tag = route.tags[0] if route.tags else "root"
    return f"{str(tag).replace('-', '_')}_{route.name}"


def _is_paginated(operation: dict[str, Any]) -> bool:
    names = {p.get("name") for p in operation.get("parameters", []) if p.get("in") == "query"}
    return {"limit", "offset"} <= names


def customize(app: FastAPI) -> None:
    original = app.openapi

    def build() -> dict[str, Any]:
        schema = original()
        components = schema.setdefault("components", {})
        if BEARER in components.get("securitySchemes", {}):
            return schema  # already customised (FastAPI caches the document)
        components.setdefault("securitySchemes", {})[BEARER] = {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }
        components.setdefault("schemas", {})["ProblemDetail"] = PROBLEM_SCHEMA
        request_id = {"description": "Echo of, or the generated, request id", "schema": {"type": "string"}}
        for methods in schema["paths"].values():
            for operation in methods.values():
                params = operation.get("parameters", [])
                authed = any(p.get("name") == "authorization" and p.get("in") == "header" for p in params)
                if authed:
                    operation["parameters"] = [p for p in params if p.get("name") != "authorization"]
                    operation["security"] = [{BEARER: []}]
                for status, response in operation["responses"].items():
                    if status.startswith("2"):
                        headers = response.setdefault("headers", {})
                        headers["X-Request-ID"] = request_id
                        if status == "200" and _is_paginated(operation):
                            headers["Link"] = {
                                "description": (
                                    "RFC 8288 next page, present when a full page came back: "
                                    '<path?limit=..&offset=..>; rel="next"'
                                ),
                                "schema": {"type": "string"},
                            }
                problem = {"application/problem+json": {"schema": {"$ref": "#/components/schemas/ProblemDetail"}}}
                # Every error, validation failures included, is problem+json (common/problem_details.py); FastAPI's own
                # 422 entry documents a different body that this API never sends.
                if "422" in operation["responses"]:
                    operation["responses"]["422"] = {"description": "Request validation failed", "content": problem}
                operation["responses"]["default"] = {
                    "description": "Error (application/problem+json)",
                    "content": problem,
                }
        for unused in ("HTTPValidationError", "ValidationError"):
            components["schemas"].pop(unused, None)  # nothing references them any more
        return schema

    # FastAPI documents replacing `app.openapi` this way; `cast` keeps the assignment type-clean without a suppression.
    cast(Any, app).openapi = build
