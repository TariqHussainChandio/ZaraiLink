"""
Unit tests for backend/app/core/auth.py's get_current_user dependency — the single gate every
protected endpoint in this backend goes through. No live Supabase project is available in this
environment, so JWT verification (core/jwt_verifier.py) and the profiles-table lookup are mocked;
what's under test is get_current_user's own branching logic (token parsing, verification failure
handling, missing profile, suspended flag, role passthrough, caching), not Supabase's or PyJWT's
behavior itself — those are exercised for real by the P4 real-stack smoke tests.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.auth import AuthenticatedUser, _profile_cache, get_bearer_token, get_current_user, require_admin_aal2
from app.core.jwt_verifier import JWKSUnavailableError, TokenVerificationError, VerifiedClaims


@pytest.fixture(autouse=True)
def _clear_profile_cache():
    # The TTL cache is a module-level global keyed by user id — without clearing it, one test's
    # cached profile would leak into the next test reusing the same user id.
    _profile_cache.clear()
    yield
    _profile_cache.clear()


def _mock_verify(claims: VerifiedClaims | None = None, exc: Exception | None = None):
    if exc is not None:
        return patch("app.core.auth.verify_access_token", side_effect=exc)
    return patch("app.core.auth.verify_access_token", return_value=claims)


def _mock_profile_lookup(rows: list[dict]):
    # The query-builder chain (.table/.select/.eq/.limit) stays synchronous even on the async
    # client — only the terminal .execute() is a coroutine (P5, item 2).
    fake_execute_result = SimpleNamespace(data=rows)
    fake_query = MagicMock()
    fake_query.select.return_value = fake_query
    fake_query.eq.return_value = fake_query
    fake_query.limit.return_value = fake_query
    fake_query.execute = AsyncMock(return_value=fake_execute_result)

    fake_client = MagicMock()
    fake_client.table.return_value = fake_query
    return patch("app.core.auth.get_user_scoped_client", new_callable=AsyncMock, return_value=fake_client)


@pytest.mark.asyncio
async def test_get_bearer_token_missing_scheme_rejected():
    with pytest.raises(HTTPException) as exc_info:
        await get_bearer_token(authorization="not-a-bearer-token")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_bearer_token_absent_header_rejected_with_401_not_422():
    # `authorization` is an Optional Header (default None) specifically so a genuinely missing
    # header reaches our own 401 here, rather than FastAPI's automatic 422 request-validation
    # error for a required-but-absent header — "missing token -> 401" is a documented
    # acceptance criterion.
    with pytest.raises(HTTPException) as exc_info:
        await get_bearer_token(authorization=None)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_bearer_token_extracts_token():
    token = await get_bearer_token(authorization="Bearer abc123")
    assert token == "abc123"


@pytest.mark.asyncio
async def test_invalid_token_rejected_with_401():
    with _mock_verify(exc=TokenVerificationError("bad signature")), pytest.raises(HTTPException) as exc_info:
        await get_current_user(token="bad-token")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_jwks_unavailable_rejected_with_503_not_401():
    # A Supabase-side outage/misconfiguration is not the same failure mode as a bad token — must
    # not be conflated with the 401 case above.
    with _mock_verify(exc=JWKSUnavailableError("could not fetch JWKS")), pytest.raises(HTTPException) as exc_info:
        await get_current_user(token="any-token")
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_valid_token_but_no_profile_rejected_with_401():
    with _mock_verify(VerifiedClaims(sub="user-1", email="a@b.com")), _mock_profile_lookup(rows=[]):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token="good-token")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_suspended_user_rejected_with_403():
    with (
        _mock_verify(VerifiedClaims(sub="user-2", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "farmer", "is_suspended": True}]),
        pytest.raises(HTTPException) as exc_info,
    ):
        await get_current_user(token="good-token")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_valid_non_suspended_user_returns_authenticated_user_with_server_side_role():
    with (
        _mock_verify(VerifiedClaims(sub="user-3", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "admin", "is_suspended": False}]),
    ):
        user = await get_current_user(token="good-token")

    assert user.id == "user-3"
    assert user.email == "a@b.com"
    # role comes from the profiles lookup, not from anything request-supplied — there is no
    # request-supplied role anywhere in this call, which is the point of the test.
    assert user.role == "admin"
    assert user.access_token == "good-token"


@pytest.mark.asyncio
async def test_profile_lookup_is_cached_across_calls():
    with (
        _mock_verify(VerifiedClaims(sub="user-4", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "buyer", "is_suspended": False}]) as mock_lookup,
    ):
        await get_current_user(token="good-token")
        await get_current_user(token="good-token")

    # get_user_scoped_client (the profile lookup) is only called once per user id within the
    # cache's TTL, even across two separate requests.
    assert mock_lookup.call_count == 1


# ------------------------------------------------------------------ require_admin_aal2 (P4, 4A.4)

_ADMIN_AAL2 = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok", aal="aal2")
_ADMIN_AAL1 = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok", aal="aal1")
_ADMIN_NO_AAL = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok")


@pytest.mark.asyncio
async def test_require_admin_aal2_allows_a_verified_second_factor():
    user = await require_admin_aal2(user=_ADMIN_AAL2)
    assert user is _ADMIN_AAL2


@pytest.mark.asyncio
async def test_require_admin_aal2_rejects_aal1_with_403():
    with pytest.raises(HTTPException) as exc_info:
        await require_admin_aal2(user=_ADMIN_AAL1)
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_require_admin_aal2_rejects_no_aal_claim_with_403():
    # A token from before MFA was ever set up on this project, or a session that never verified
    # a second factor — must fail closed, not be treated as implicitly sufficient.
    with pytest.raises(HTTPException) as exc_info:
        await require_admin_aal2(user=_ADMIN_NO_AAL)
    assert exc_info.value.status_code == 403
