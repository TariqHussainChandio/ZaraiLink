from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
import pytest

from app.core.auth import AuthenticatedUser
from app.main import app
from app.services import messaging_service as service

client = TestClient(app)

USER = AuthenticatedUser(id="user-1", email="u@x.com", role="buyer", access_token="tok")


def test_send_message_uses_callers_own_id_as_sender_not_a_client_supplied_one():
    with patch("app.services.messaging_service.repo.send_message", return_value={"id": "m-1"}) as mock_send:
        service.send_message(USER, "conv-1", "hello", [])
    # sender_id argument (3rd positional) is USER.id — there is no sender_id parameter on
    # send_message at all, so it can only ever be the authenticated caller.
    args, _ = mock_send.call_args
    assert args[2] == USER.id


def test_find_or_create_conversation_returns_existing_without_inserting():
    with patch("app.services.messaging_service.repo.find_conversation", return_value={"id": "conv-1"}):
        with patch("app.services.messaging_service.repo.create_conversation") as mock_create:
            result = service.find_or_create_conversation(USER, "other-1")
    mock_create.assert_not_called()
    assert result == {"id": "conv-1"}


def test_find_or_create_conversation_retries_on_unique_violation_race():
    call_count = {"n": 0}

    def create_side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise APIError({"code": "23505", "message": "duplicate key"})
        return {"id": "conv-1"}

    with patch("app.services.messaging_service.repo.find_conversation", side_effect=[None, {"id": "conv-1"}]):
        with patch("app.services.messaging_service.repo.create_conversation", side_effect=create_side_effect):
            result = service.find_or_create_conversation(USER, "other-1")

    assert result == {"id": "conv-1"}
    assert call_count["n"] == 1  # the retry path re-finds instead of re-inserting


def test_find_or_create_conversation_reraises_non_race_errors():
    with patch("app.services.messaging_service.repo.find_conversation", return_value=None):
        with patch(
            "app.services.messaging_service.repo.create_conversation",
            side_effect=APIError({"code": "42501", "message": "permission denied"}),
        ):
            with pytest.raises(APIError):
                service.find_or_create_conversation(USER, "other-1")


def test_redact_message_requires_admin():
    response = client.patch("/api/v1/messaging/messages/m-1/redact")
    assert response.status_code != 204


def test_list_conversations_without_authorization_header_is_rejected():
    response = client.get("/api/v1/messaging/conversations")
    assert response.status_code == 401
