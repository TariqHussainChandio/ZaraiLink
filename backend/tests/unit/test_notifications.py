from unittest.mock import patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from app.core.auth import AuthenticatedUser
from app.main import app
from app.services import notifications_service as service

client = TestClient(app)

USER = AuthenticatedUser(id="user-1", email="u@x.com", role="buyer", access_token="tok")


def test_mark_read_rejects_notification_that_does_not_belong_to_caller():
    # get_notification uses the caller's own RLS-scoped client, so a stranger's notification id
    # simply comes back as None — mark_read must turn that into a 404, not silently no-op.
    with patch("app.services.notifications_service.repo.get_notification", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            service.mark_read(USER, "someone-elses-notification")
    assert exc_info.value.status_code == 404


def test_mark_read_updates_when_notification_belongs_to_caller():
    with patch("app.services.notifications_service.repo.get_notification", return_value={"id": "n-1"}):
        with patch("app.services.notifications_service.repo.mark_read") as mock_mark:
            service.mark_read(USER, "n-1")
    mock_mark.assert_called_once_with(USER.access_token, "n-1")


def test_list_notifications_without_authorization_header_is_rejected():
    response = client.get("/api/v1/notifications")
    assert response.status_code != 200


def test_mark_all_read_without_authorization_header_is_rejected():
    response = client.patch("/api/v1/notifications/read-all")
    assert response.status_code != 200
    assert response.status_code != 204
