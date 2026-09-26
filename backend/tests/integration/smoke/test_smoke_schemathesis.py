"""P7 (7A): property-based contract testing. Schemathesis generates requests from backend/openapi.json (the document the
mobile client is generated from) and fires them at the real running API, as a user of the role each operation needs.

It looks for what hand-written tests do not: a request the schema allows that the server answers with a 5xx, a response
that does not match its documented schema, or one with an undocumented content type. Inputs are random but bounded
(few examples per operation, so a CI run stays short); a failure prints the exact request to reproduce it.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import schemathesis
from hypothesis import HealthCheck, settings
from schemathesis.specs.openapi.checks import content_type_conformance, response_schema_conformance

BACKEND = Path(__file__).resolve().parents[3]
SPEC = BACKEND / "openapi.json"
POLICY = json.loads((Path(__file__).with_name("authorization_policy.json")).read_text(encoding="utf-8"))

schema = schemathesis.openapi.from_path(str(SPEC))

# Operations whose random writes are pointless or harmful to fuzz, with the reason. Everything else runs.
SKIPPED: dict[tuple[str, str], str] = {}
# Deleting the account of the actor the run depends on would break every later request.
SKIPPED[("DELETE", "/api/v1/profile/me")] = "deletes the calling user, which the rest of the run needs"
# Random bodies cannot upload a real image and run inference on it; the smoke suite covers this route.
SKIPPED[("POST", "/api/v1/disease/predict")] = "needs a real image in storage; covered by the disease smoke test"


def _token(world, method: str, path: str) -> str | None:
    entry = POLICY.get(f"{method} {path}")
    if entry is None or entry["kind"] == "public":
        return None
    role = entry["roles"][0]
    return {
        "farmer": world.farmer.token,
        "buyer": world.buyer.token,
        "dealer": world.dealer.token,
        "expert": world.expert.token,
        "admin": world.admin.token,
    }[role]


@schema.parametrize()
@settings(max_examples=6, deadline=None, suppress_health_check=list(HealthCheck), derandomize=True)
def test_the_api_honours_its_own_contract(case, world, backend_url):
    key = (case.operation.method.upper(), case.operation.path)
    if key in SKIPPED:
        pytest.skip(SKIPPED[key])
    token = _token(world, *key)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    response = case.call(base_url=backend_url, headers=headers)
    case.validate_response(
        response,
        checks=(response_schema_conformance, content_type_conformance),
    )
    assert response.status_code < 500, (
        f"{key[0]} {key[1]} answered {response.status_code}: {response.text[:300]} | "
        f"reproduce: {case.as_curl_command(headers={'Authorization': '[token]'})}"
    )
