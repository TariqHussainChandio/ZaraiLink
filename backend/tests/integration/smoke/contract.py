"""P7 (7A) contract check: every real API response in the smoke suite must match the published OpenAPI schema.

The mobile client is generated from `backend/openapi.json`, so a response that differs from its declared schema is a
bug the generated types would hide. The smoke fixtures pass every response through `check()`; it finds the operation
by method and path template, and validates a 2xx JSON body against that operation's response schema with
`jsonschema`. Which operations were exercised is recorded so test_zz_contract_coverage.py can say which were not.
"""

from __future__ import annotations

import os
import re
from functools import lru_cache

import jsonschema

VALIDATED: set[tuple[str, str]] = set()


@lru_cache(maxsize=1)
def spec() -> dict:
    for name, local in (
        ("SUPABASE_URL", "LOCAL_SUPABASE_URL"),
        ("SUPABASE_ANON_KEY", "LOCAL_SUPABASE_ANON_KEY"),
        ("SUPABASE_SERVICE_ROLE_KEY", "LOCAL_SUPABASE_SERVICE_ROLE_KEY"),
    ):
        if os.environ.get(local):
            os.environ.setdefault(name, os.environ[local])
    from app.main import app

    return app.openapi()


@lru_cache(maxsize=1)
def _templates() -> list[tuple[re.Pattern[str], str]]:
    found = []
    for template in spec()["paths"]:
        pattern = re.sub(r"\{[^}]+\}", "[^/]+", template)
        found.append((re.compile("^" + pattern + "$"), template))
    # literal segments must win over parameters (/listings/moderation before /listings/{id})
    return sorted(found, key=lambda item: item[1].count("{"))


def find_operation(method: str, path: str) -> tuple[str, dict] | None:
    clean = path.split("?", 1)[0]
    for pattern, template in _templates():
        operation = spec()["paths"][template].get(method.lower())
        if operation is not None and pattern.match(clean):
            return template, operation
    return None


def check(method: str, path: str, response) -> None:
    if not 200 <= response.status_code < 300:
        return
    found = find_operation(method, path)
    assert found is not None, f"{method} {path}: no such operation in the OpenAPI document"
    template, operation = found
    declared = operation["responses"].get(str(response.status_code))
    assert declared is not None, f"{method} {template}: status {response.status_code} is not documented"
    content = declared.get("content", {})
    if "application/json" not in content:
        assert not response.content, f"{method} {template}: documented as no content but returned a body"
        VALIDATED.add((method.upper(), template))
        return
    schema = {**content["application/json"]["schema"], "components": spec()["components"]}
    try:
        jsonschema.Draft202012Validator(schema).validate(response.json())
    except jsonschema.ValidationError as exc:
        where = "/".join(str(p) for p in exc.absolute_path) or "(root)"
        raise AssertionError(
            f"{method} {template}: response does not match its schema at {where}: {exc.message}"
        ) from exc
    VALIDATED.add((method.upper(), template))
