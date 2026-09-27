from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser
from app.main import app
from app.services import profile_service as service

client = TestClient(app)

USER = AuthenticatedUser(id="user-1", email="u@x.com", role="farmer", access_token="tok")


@pytest.mark.asyncio
async def test_update_profile_writes_only_to_callers_own_row():
    with patch("app.services.profile_service.repo.update_profile") as mock_update:
        await service.update_profile(USER, {"full_name": "New Name"})
    mock_update.assert_called_once_with(USER.access_token, USER.id, {"full_name": "New Name"})


def test_update_profile_without_authorization_header_is_rejected():
    response = client.patch("/api/v1/profile", json={"full_name": "X"})
    assert response.status_code != 200
    assert response.status_code != 204


def test_update_profile_schema_has_no_role_or_suspension_field():
    from app.schemas.profile import ProfileUpdateRequest

    assert "role" not in ProfileUpdateRequest.model_fields
    assert "is_suspended" not in ProfileUpdateRequest.model_fields
