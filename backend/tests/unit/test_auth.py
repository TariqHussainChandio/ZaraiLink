"""
Unit tests for backend/app/core/auth.py's get_current_user dependency — the single gate every
protected endpoint in this backend goes through. No live Supabase project is available in this
environment, so the Supabase Auth HTTP call and the profiles-table lookup are mocked; what's
under test is get_current_user's own branching logic (token parsing, non-200 handling, missing
profile, suspended flag, role passthrough), not Supabase's behavior itself.
"""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.auth import get_bearer_token, get_current_user


class FakeHttpxResponse:
    def __init__(self, status_code: int, json_body: dict):
        self.status_code = status_code
        self._json_body = json_body

    def json(self):
        return self._json_body


def _mock_httpx_get(status_code: int, json_body: dict):
    fake_response = FakeHttpxResponse(status_code, json_body)
    mock_client = AsyncMock()
    mock_client.get.return_value = fake_response
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False
    return patch("app.core.auth.httpx.AsyncClient", return_value=mock_client)


def _mock_profile_lookup(rows: list[dict]):
    fake_execute_result = SimpleNamespace(data=rows)
    fake_query = MagicMock()
    fake_query.select.return_value = fake_query
    fake_query.eq.return_value = fake_query
    fake_query.limit.return_value = fake_query
    fake_query.execute.return_value = fake_execute_result

    fake_client = MagicMock()
    fake_client.table.return_value = fake_query
    return patch("app.core.auth.get_user_scoped_client", return_value=fake_client)


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
    with _mock_httpx_get(status_code=401, json_body={}):
        with pytest.raises(HTTPException) as exc_info:
            await get_current_user(token="bad-token")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_valid_token_but_no_profile_rejected_with_401():
    with _mock_httpx_get(status_code=200, json_body={"id": "user-1", "email": "a@b.com"}):
        with _mock_profile_lookup(rows=[]):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(token="good-token")
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_suspended_user_rejected_with_403():
    with _mock_httpx_get(status_code=200, json_body={"id": "user-1", "email": "a@b.com"}):
        with _mock_profile_lookup(rows=[{"role": "farmer", "is_suspended": True}]):
            with pytest.raises(HTTPException) as exc_info:
                await get_current_user(token="good-token")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_valid_non_suspended_user_returns_authenticated_user_with_server_side_role():
    with _mock_httpx_get(status_code=200, json_body={"id": "user-1", "email": "a@b.com"}):
        with _mock_profile_lookup(rows=[{"role": "admin", "is_suspended": False}]):
            user = await get_current_user(token="good-token")

    assert user.id == "user-1"
    assert user.email == "a@b.com"
    # role comes from the profiles lookup, not from anything request-supplied — there is no
    # request-supplied role anywhere in this call, which is the point of the test.
    assert user.role == "admin"
    assert user.access_token == "good-token"
