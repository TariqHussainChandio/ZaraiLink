"""
Unit tests for backend/app/auth/dependencies.py's get_current_user dependency — the single gate every
protected endpoint in this backend goes through. No live Supabase project is available in this
environment, so JWT verification (auth/jwt_verifier.py) and the profiles-table lookup are mocked;
what's under test is get_current_user's own branching logic (token parsing, verification failure
handling, missing profile, suspended flag, role passthrough, caching), not Supabase's or PyJWT's
behavior itself — those are exercised for real by the P4 real-stack smoke tests.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.auth.dependencies import (
    AuthenticatedUser,
    _profile_cache,
    forget_profile,
    get_bearer_token,
    get_current_user,
    get_current_user_any_status,
    require_admin_aal2,
)
from app.auth.jwt_verifier import JWKSUnavailableError, TokenVerificationError, VerifiedClaims, _signed_in_at


@pytest.fixture(autouse=True)
def _clear_profile_cache():
    # The TTL cache is a module-level global keyed by user id — without clearing it, one test's
    # cached profile would leak into the next test reusing the same user id.
    _profile_cache.clear()
    yield
    _profile_cache.clear()


def _mock_verify(claims: VerifiedClaims | None = None, exc: Exception | None = None):
    if exc is not None:
        return patch("app.auth.dependencies.verify_access_token", side_effect=exc)
    return patch("app.auth.dependencies.verify_access_token", return_value=claims)


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
    return patch("app.auth.dependencies.get_user_scoped_client", new_callable=AsyncMock, return_value=fake_client)


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


# ---- Account status (A3a; SRDS §8, §11, §13; D10) -------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["dealer", "expert"])
@pytest.mark.parametrize("status", ["pending", "rejected"])
async def test_unapproved_dealer_or_expert_rejected_with_account_not_approved(role, status):
    # A dealer or expert acts only after an admin approves them. The status comes from the profile lookup, never from
    # the request or the token.
    with (
        _mock_verify(VerifiedClaims(sub=f"user-{role}-{status}", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": role, "is_suspended": False, "account_status": status}]),
        pytest.raises(HTTPException) as exc_info,
    ):
        await get_current_user(token="good-token")
    assert exc_info.value.status_code == 403
    assert getattr(exc_info.value, "code", None) == "account_not_approved"


@pytest.mark.asyncio
@pytest.mark.parametrize("role", ["farmer", "buyer"])
async def test_farmers_and_buyers_need_no_approval(role):
    with (
        _mock_verify(VerifiedClaims(sub=f"user-{role}", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": role, "is_suspended": False, "account_status": "approved"}]),
    ):
        user = await get_current_user(token="good-token")
    assert user.role == role


@pytest.mark.asyncio
async def test_unapproved_dealer_still_reaches_any_status_routes():
    # Their own profile, account deletion and (for experts) the application stay reachable while they wait.
    with (
        _mock_verify(VerifiedClaims(sub="user-pending-dealer", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "dealer", "is_suspended": False, "account_status": "pending"}]),
    ):
        user = await get_current_user_any_status(token="good-token")
    assert user.role == "dealer"
    assert user.account_status == "pending"


@pytest.mark.asyncio
async def test_approved_dealer_passes():
    with (
        _mock_verify(VerifiedClaims(sub="user-approved-dealer", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "dealer", "is_suspended": False, "account_status": "approved"}]),
    ):
        user = await get_current_user(token="good-token")
    assert user.account_status == "approved"


@pytest.mark.asyncio
async def test_suspension_is_checked_before_approval():
    # A suspended account is refused as suspended even if it is also pending: the app routes the two differently.
    with (
        _mock_verify(VerifiedClaims(sub="user-suspended-pending", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "expert", "is_suspended": True, "account_status": "pending"}]),
        pytest.raises(HTTPException) as exc_info,
    ):
        await get_current_user_any_status(token="good-token")
    assert getattr(exc_info.value, "code", None) == "account_suspended"


@pytest.mark.asyncio
async def test_a_pending_profile_is_read_again_so_an_approval_takes_effect_at_once():
    # Only approved profiles are cached: the second call sees the admin's approval immediately.
    with (
        _mock_verify(VerifiedClaims(sub="user-awaiting-approval", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "dealer", "is_suspended": False, "account_status": "pending"}]) as lookup,
    ):
        await get_current_user_any_status(token="good-token")
        await get_current_user_any_status(token="good-token")
    assert lookup.call_count == 2


@pytest.mark.asyncio
async def test_an_admin_decision_drops_the_cached_profile():
    # forget_profile (called after every admin decision about a user) makes the next request read the profile again.
    with (
        _mock_verify(VerifiedClaims(sub="user-decided", email="a@b.com")),
        _mock_profile_lookup(rows=[{"role": "dealer", "is_suspended": False, "account_status": "approved"}]) as lookup,
    ):
        await get_current_user(token="good-token")
        forget_profile("user-decided")
        await get_current_user(token="good-token")
    assert lookup.call_count == 2


# SRDS §8: an approved dealer or expert logs in again. 2026-10-05T08:00:00Z is 1791187200.
_APPROVED_AT = "2026-10-05T08:00:00+00:00"


@pytest.mark.asyncio
async def test_a_session_from_before_the_approval_must_sign_in_again():
    with (
        _mock_verify(VerifiedClaims(sub="user-old-session", email="a@b.com", signed_in_at=1791187200 - 60)),
        _mock_profile_lookup(
            rows=[
                {
                    "role": "dealer",
                    "is_suspended": False,
                    "account_status": "approved",
                    "account_status_changed_at": _APPROVED_AT,
                }
            ]
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await get_current_user(token="good-token")
    assert exc_info.value.status_code == 403
    assert getattr(exc_info.value, "code", None) == "sign_in_again"


@pytest.mark.asyncio
async def test_a_sign_in_after_the_approval_passes():
    with (
        _mock_verify(VerifiedClaims(sub="user-new-session", email="a@b.com", signed_in_at=1791187200 + 60)),
        _mock_profile_lookup(
            rows=[
                {
                    "role": "dealer",
                    "is_suspended": False,
                    "account_status": "approved",
                    "account_status_changed_at": _APPROVED_AT,
                }
            ]
        ),
    ):
        user = await get_current_user(token="good-token")
    assert user.role == "dealer"


@pytest.mark.asyncio
async def test_sign_in_again_applies_only_to_reviewed_roles():
    # A farmer made a farmer again by an admin has a changed_at too, but was never reviewed.
    with (
        _mock_verify(VerifiedClaims(sub="user-farmer-old", email="a@b.com", signed_in_at=1791187200 - 60)),
        _mock_profile_lookup(
            rows=[
                {
                    "role": "farmer",
                    "is_suspended": False,
                    "account_status": "approved",
                    "account_status_changed_at": _APPROVED_AT,
                }
            ]
        ),
    ):
        user = await get_current_user(token="good-token")
    assert user.role == "farmer"


def test_signed_in_at_is_the_latest_amr_timestamp():
    # A second factor adds a later entry; a refresh keeps the list unchanged (observed against local GoTrue).
    assert _signed_in_at([{"method": "password", "timestamp": 10}, {"method": "totp", "timestamp": 20}]) == 20
    assert _signed_in_at(None) is None
    assert _signed_in_at([{"method": "password"}]) is None
