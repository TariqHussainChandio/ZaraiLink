from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser
from app.common.errors import AppHTTPException
from app.common.profile import repository as repo
from app.common.profile import service
from app.main import app

client = TestClient(app)

USER = AuthenticatedUser(id="user-1", email="u@x.com", role="farmer", access_token="tok")
ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok-a")


@pytest.mark.asyncio
async def test_update_profile_writes_only_to_callers_own_row():
    with patch("app.common.profile.service.repo.update_profile") as mock_update:
        await service.update_profile(USER, {"full_name": "New Name"})
    mock_update.assert_called_once_with(USER.access_token, USER.id, {"full_name": "New Name"})


@pytest.mark.asyncio
@pytest.mark.parametrize("field", ["full_name", "phone", "street", "city", "avatar_url"])
async def test_the_admins_details_are_set_by_the_system(field):
    # D19: the admin changes the password and preferences only; the details are predefined.
    with patch("app.common.profile.service.repo.update_profile") as mock_update, pytest.raises(AppHTTPException) as exc:
        await service.update_profile(ADMIN, {field: "x"})
    assert exc.value.status_code == 403
    mock_update.assert_not_called()


@pytest.mark.asyncio
async def test_the_admin_still_changes_a_preference():
    with patch("app.common.profile.service.repo.update_profile") as mock_update:
        await service.update_profile(ADMIN, {"notifications_enabled": False})
    mock_update.assert_called_once_with(ADMIN.access_token, ADMIN.id, {"notifications_enabled": False})


@pytest.mark.asyncio
async def test_the_admin_account_cannot_be_deleted():
    with patch("app.common.profile.service.repo.reauthenticate") as mock_reauth, pytest.raises(AppHTTPException) as exc:
        await service.delete_own_account(ADMIN, "password")
    assert exc.value.status_code == 403
    mock_reauth.assert_not_called()


def test_update_profile_without_authorization_header_is_rejected():
    response = client.patch("/api/v1/profile", json={"full_name": "X"})
    assert response.status_code != 200
    assert response.status_code != 204


def test_update_profile_schema_has_no_role_or_suspension_field():
    from app.common.profile.schemas import ProfileUpdateRequest

    assert "role" not in ProfileUpdateRequest.model_fields
    assert "is_suspended" not in ProfileUpdateRequest.model_fields


class _RefusingRpc:
    """A client whose submit_application() call fails the way PostgREST reports the database's refusal."""

    def __init__(self, code: str, message: str):
        self._error = APIError({"code": code, "message": message})

    def rpc(self, *_args, **_kwargs):
        return self

    async def execute(self):
        raise self._error


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("code", "message", "status", "error_code"),
    [
        ("23514", "The application is missing: business details, Business licence", 409, "application_incomplete"),
        ("23514", "The application is already under review", 409, "invalid_transition"),
        ("42501", "A suspended account cannot send an application", 403, "forbidden"),
    ],
)
async def test_a_refused_submission_says_why(code, message, status, error_code):
    refusing = _RefusingRpc(code, message)
    with (
        patch("app.common.profile.repository.get_user_scoped_client", return_value=refusing),
        pytest.raises(AppHTTPException) as caught,
    ):
        await repo.submit_application("tok")
    assert (caught.value.status_code, caught.value.code) == (status, error_code)
    assert caught.value.detail == message
