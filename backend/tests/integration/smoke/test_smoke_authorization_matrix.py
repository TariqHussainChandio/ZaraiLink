"""P5 (item 10) — role x route authorization matrix, generated from the real dependency tree.

Every route is classified by walking FastAPI's own `route.dependant` for `get_current_user`, the
`require_role(...)` dependencies (their roles are read from `auth.declared_roles`) and
`require_admin_aal2`, and each is probed as every role over real HTTP with real tokens.

Deriving the expectation from the route alone cannot notice a route whose requirement was weakened (the
independent P5 verification swapped `require_dealer` for any-authenticated and the matrix stayed green), so
the derived policy is also compared with `authorization_policy.json`, a reviewed snapshot of who may call
what. Changing a route's roles changes the derived policy, fails the comparison, and shows up as a diff in
that file during review. To accept a deliberate change:
    UPDATE_AUTHORIZATION_POLICY=1 python -m pytest tests/integration/smoke/test_smoke_authorization_matrix.py

Only the AUTH layer is asserted: a permitted caller must not be rejected for who they are; a business
answer (404 for a made-up id, 422 for the empty body sent here) is a pass. The one hand-kept list is
EXPECTED_PUBLIC, on purpose: a route with no auth dependency is public by accident until someone says
otherwise, so a new one fails here until it is added deliberately.
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import pytest
from pydantic import ValidationError
from route_walk import ApiRoute, api_routes

# The smoke fixtures hand the backend subprocess its Supabase settings explicitly; importing the app
# in this process needs the same values (and must not fail collection where there is no local stack).
for _name, _local in (
    ("SUPABASE_URL", "LOCAL_SUPABASE_URL"),
    ("SUPABASE_ANON_KEY", "LOCAL_SUPABASE_ANON_KEY"),
    ("SUPABASE_SERVICE_ROLE_KEY", "LOCAL_SUPABASE_SERVICE_ROLE_KEY"),
):
    if os.environ.get(_local):
        os.environ.setdefault(_name, os.environ[_local])

try:
    from app.auth.dependencies import (
        declared_any_status,
        declared_roles,
        get_current_user,
        get_current_user_any_status,
        require_admin_aal2,
    )
    from app.main import app
except ValidationError:  # no Supabase settings available: the tests below skip via backend_url
    app = None

POLICY_FILE = Path(__file__).with_name("authorization_policy.json")
ROLES = ("farmer", "buyer", "dealer", "expert", "admin")
AUTH_TITLES = {
    "Insufficient role",
    "Account suspended",
    "Account not approved",
    "Your account was approved. Sign in again to continue.",
    "This action requires a verified second factor (MFA).",
}

EXPECTED_PUBLIC = {
    ("GET", "/health"),
    ("GET", "/health/live"),
    ("GET", "/health/ready"),
    ("GET", "/version"),
    ("GET", "/api/v1/expert"),
    ("GET", "/api/v1/expert/{expert_id}"),
    ("GET", "/api/v1/marketplace/listings"),
    ("GET", "/api/v1/marketplace/listings/{listing_id}"),
    ("GET", "/api/v1/marketplace/categories"),
    ("GET", "/api/v1/marketplace/crops"),
    ("GET", "/api/v1/reference-data/currencies"),
    ("GET", "/api/v1/reference-data/units"),
    ("GET", "/api/v1/reference-data/{table}/rows"),
    ("GET", "/api/v1/reviews/{review_id}"),
    ("GET", "/api/v1/reviews/by-order/{order_id}"),
    ("GET", "/api/v1/reviews/by-consultation/{consultation_id}"),
    ("GET", "/api/v1/reviews/by-listing/{listing_id}"),
    ("GET", "/api/v1/reviews/by-seller/{seller_id}"),
    ("GET", "/api/v1/reviews/by-expert/{expert_id}"),
}


def _calls(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _calls(sub)


def _classify(route: ApiRoute):
    """(kind, roles, any_status): any_status marks a route a pending or rejected dealer or expert may still call
    (A3a, D10); every other authenticated route refuses them with 403 `account_not_approved`."""
    calls = list(_calls(route.dependant))
    any_status = any(call in declared_any_status for call in calls)
    if require_admin_aal2 in calls:
        return "aal2", ("admin",), False
    for call in calls:
        if call in declared_roles:
            return "roles", declared_roles[call], any_status
    if get_current_user in calls or get_current_user_any_status in calls:
        return "auth", ROLES, any_status
    return "public", ROLES, False


def _routes():
    if app is None:
        return []
    return [(method, route.path, *_classify(route)) for route in api_routes(app) for method in sorted(route.methods)]


def _derived_policy() -> dict[str, dict]:
    return {
        f"{method} {path}": {"kind": kind, "roles": sorted(roles), **({"any_status": True} if any_status else {})}
        for method, path, kind, roles, any_status in sorted(_routes(), key=lambda r: (r[1], r[0]))
    }


def test_the_derived_policy_matches_the_reviewed_snapshot():
    if app is None:
        pytest.skip("no Supabase settings in this environment")
    derived = _derived_policy()
    if os.environ.get("UPDATE_AUTHORIZATION_POLICY") == "1":
        POLICY_FILE.write_text(json.dumps(derived, indent=1) + chr(10), encoding="utf-8", newline=chr(10))
    expected = json.loads(POLICY_FILE.read_text(encoding="utf-8"))
    changed = sorted(k for k in derived.keys() & expected.keys() if derived[k] != expected[k])
    assert derived == expected, (
        f"authorization policy drifted from authorization_policy.json. "
        f"changed: {[(k, expected[k], derived[k]) for k in changed]}; "
        f"new routes: {sorted(derived.keys() - expected.keys())}; removed: {sorted(expected.keys() - derived.keys())}"
    )


def _rejected_for_who_you_are(response) -> bool:
    if response.status_code == 401:
        return True
    return (
        response.status_code == 403
        and response.headers.get("content-type", "").startswith("application/problem+json")
        and response.json().get("title") in AUTH_TITLES
    )


def _call(api_client, method, path, token):
    url = "".join(part if not part.startswith("{") else str(uuid.uuid4()) for part in _split(path))
    kwargs = {"json": {}} if method in ("POST", "PATCH", "PUT", "DELETE") else {}
    return api_client(method, url, token, **kwargs)


def _split(path):
    import re

    return [p for p in re.split(r"(\{[^}]+\})", path) if p]


def test_every_route_is_classified_and_the_public_set_is_exactly_the_expected_one():
    if app is None:
        pytest.skip("no Supabase settings in this environment")
    routes = _routes()
    assert len(routes) > 100, "route enumeration found suspiciously few routes"
    public = {(m, p) for m, p, kind, _, _ in routes if kind == "public"}
    assert public == EXPECTED_PUBLIC, (
        f"unexpectedly public (missing an auth dependency?): {sorted(public - EXPECTED_PUBLIC)}; "
        f"expected public but now protected (update EXPECTED_PUBLIC): {sorted(EXPECTED_PUBLIC - public)}"
    )


@pytest.mark.parametrize(
    ("method", "path", "kind", "roles", "any_status"), _routes(), ids=lambda v: v if isinstance(v, str) else ""
)
def test_authorization_matrix(method, path, kind, roles, any_status, matrix_actors, api_client):
    anonymous = _call(api_client, method, path, None)
    assert anonymous.status_code != 429, "rate limited: the matrix is being throttled, not tested"
    if kind == "public":
        assert not _rejected_for_who_you_are(anonymous), f"{method} {path} rejected an anonymous caller"
    else:
        assert anonymous.status_code == 401, f"{method} {path} anonymous -> {anonymous.status_code}"

    for role in ROLES:
        response = _call(api_client, method, path, matrix_actors[role])
        assert response.status_code != 429, f"{method} {path} as {role}: rate limited"
        if role in roles:
            assert not _rejected_for_who_you_are(response), (
                f"{method} {path} as {role} was rejected: {response.status_code} {response.text}"
            )
        else:
            assert response.status_code == 403, f"{method} {path} as {role} -> {response.status_code}"
            assert response.json()["title"] == "Insufficient role", response.text

    # A pending dealer or expert (A3a, D10): refused as not approved everywhere except the few routes open to them.
    if kind != "public":
        for actor, role in (("dealer_pending", "dealer"), ("expert_pending", "expert")):
            response = _call(api_client, method, path, matrix_actors[actor])
            assert response.status_code != 429, f"{method} {path} as {actor}: rate limited"
            if any_status and role in roles:
                assert not _rejected_for_who_you_are(response), (
                    f"{method} {path} as {actor} was rejected: {response.status_code} {response.text}"
                )
            elif any_status:
                assert response.status_code == 403, f"{method} {path} as {actor} -> {response.status_code}"
                assert response.json()["title"] == "Insufficient role", response.text
            else:
                assert response.status_code == 403, f"{method} {path} as {actor} -> {response.status_code}"
                assert response.json()["code"] == "account_not_approved", response.text

    if kind == "aal2":
        no_mfa = _call(api_client, method, path, matrix_actors["admin_aal1"])
        assert no_mfa.status_code == 403, f"{method} {path} admin without MFA -> {no_mfa.status_code}"
        assert "second factor" in no_mfa.json()["title"], no_mfa.text
