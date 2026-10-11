from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from pydantic import ValidationError

from app.auth.dependencies import AuthenticatedUser, require_authenticated_user
from app.common.messaging import service
from app.common.messaging.schemas import FindOrCreateConversationRequest
from app.main import app

client = TestClient(app)

USER = AuthenticatedUser(id="user-1", email="u@x.com", role="buyer", access_token="tok")


@pytest.mark.asyncio
async def test_send_message_uses_callers_own_id_as_sender_not_a_client_supplied_one():
    with patch("app.common.messaging.service.repo.send_message", return_value={"id": "m-1"}) as mock_send:
        await service.send_message(USER, "conv-1", "hello", [])
    # sender_id argument (3rd positional) is USER.id — there is no sender_id parameter on
    # send_message at all, so it can only ever be the authenticated caller.
    args, _ = mock_send.call_args
    assert args[2] == USER.id


@pytest.mark.asyncio
async def test_find_or_create_conversation_returns_existing_without_inserting():
    with (
        patch("app.common.messaging.service.repo.find_conversation", return_value={"id": "conv-1"}),
        patch("app.common.messaging.service.repo.create_conversation") as mock_create,
    ):
        result = await service.find_or_create_conversation(USER, "other-1", "listing", "listing-1")
    mock_create.assert_not_called()
    assert result == {"id": "conv-1"}


@pytest.mark.asyncio
async def test_find_or_create_conversation_retries_on_unique_violation_race():
    call_count = {"n": 0}

    def create_side_effect(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise APIError({"code": "23505", "message": "duplicate key"})
        return {"id": "conv-1"}

    with (
        patch("app.common.messaging.service.repo.find_conversation", side_effect=[None, {"id": "conv-1"}]),
        patch("app.common.messaging.service.repo.create_conversation", side_effect=create_side_effect),
    ):
        result = await service.find_or_create_conversation(USER, "other-1", "listing", "listing-1")

    assert result == {"id": "conv-1"}
    assert call_count["n"] == 1  # the retry path re-finds instead of re-inserting


@pytest.mark.asyncio
async def test_find_or_create_conversation_maps_an_rls_refusal_to_403():
    with (
        patch("app.common.messaging.service.repo.find_conversation", return_value=None),
        patch(
            "app.common.messaging.service.repo.create_conversation",
            side_effect=APIError({"code": "42501", "message": "permission denied"}),
        ),
        pytest.raises(HTTPException) as refused,
    ):
        await service.find_or_create_conversation(USER, "other-1", "listing", "listing-1")
    # A5: the database refuses an unrelated pair (conversations_insert_related); the caller gets a 403, not a 500.
    assert refused.value.status_code == 403


def test_redact_message_requires_admin():
    response = client.patch("/api/v1/messaging/messages/m-1/redact")
    assert response.status_code != 204


def test_list_conversations_without_authorization_header_is_rejected():
    response = client.get("/api/v1/messaging/conversations")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_find_or_create_conversation_reraises_other_database_errors():
    with (
        patch("app.common.messaging.service.repo.find_conversation", return_value=None),
        patch(
            "app.common.messaging.service.repo.create_conversation",
            side_effect=APIError({"code": "22P02", "message": "invalid input syntax for type uuid"}),
        ),
        pytest.raises(APIError),
    ):
        await service.find_or_create_conversation(USER, "other-1", "listing", "not-a-uuid")


@pytest.mark.asyncio
async def test_find_or_create_conversation_passes_the_context_to_the_insert():
    with (
        patch("app.common.messaging.service.repo.find_conversation", return_value=None),
        patch("app.common.messaging.service.repo.create_conversation", return_value={"id": "conv-2"}) as mock_create,
    ):
        result = await service.find_or_create_conversation(USER, "other-1", "order", "order-1")
    mock_create.assert_called_once_with(USER.access_token, USER.id, "other-1", "order", "order-1")
    assert result == {"id": "conv-2"}


@pytest.mark.asyncio
async def test_send_message_maps_an_rls_refusal_to_403():
    with (
        patch(
            "app.common.messaging.service.repo.send_message",
            side_effect=APIError({"code": "42501", "message": "new row violates row-level security policy"}),
        ),
        pytest.raises(HTTPException) as refused,
    ):
        await service.send_message(USER, "conv-1", "hello", [])
    assert refused.value.status_code == 403


@pytest.mark.parametrize("context_type", ["listing", "order", "consultation"])
def test_find_or_create_request_accepts_each_context(context_type):
    request = FindOrCreateConversationRequest(
        other_user_id="00000000-0000-4000-8000-000000000002",
        context_type=context_type,
        context_id="00000000-0000-4000-8000-0000000000c1",
    )
    assert request.context_type == context_type


@pytest.mark.parametrize(
    "body",
    [
        {"other_user_id": "00000000-0000-4000-8000-000000000002"},  # the pre-A5 shape: no context
        {"other_user_id": "00000000-0000-4000-8000-000000000002", "context_type": "listing"},
        {"other_user_id": "00000000-0000-4000-8000-000000000002", "context_id": "00000000-0000-4000-8000-0000000000c1"},
        {
            "other_user_id": "00000000-0000-4000-8000-000000000002",
            "context_type": "store",
            "context_id": "00000000-0000-4000-8000-0000000000c1",
        },
        {"context_type": "listing", "context_id": "00000000-0000-4000-8000-0000000000c1"},
        {
            "other_user_id": "not-a-uuid",
            "context_type": "listing",
            "context_id": "00000000-0000-4000-8000-0000000000c1",
        },  # A5 verifier: ids are UUIDs
        {
            "other_user_id": "00000000-0000-4000-8000-000000000002",
            "context_type": "listing",
            "context_id": "x),or(1.eq.1",
        },
    ],
)
def test_find_or_create_request_requires_a_known_context(body):
    with pytest.raises(ValidationError):
        FindOrCreateConversationRequest(**body)


def test_find_or_create_route_rejects_a_body_without_context_before_touching_the_database():
    app.dependency_overrides[require_authenticated_user] = lambda: USER
    try:
        with patch("app.common.messaging.service.repo.find_conversation") as mock_find:
            response = client.post(
                "/api/v1/messaging/conversations", json={"other_user_id": "00000000-0000-4000-8000-000000000002"}
            )
    finally:
        app.dependency_overrides.pop(require_authenticated_user, None)
    assert response.status_code == 422
    mock_find.assert_not_called()


def test_find_or_create_route_returns_403_for_an_unrelated_pair():
    app.dependency_overrides[require_authenticated_user] = lambda: USER
    try:
        with (
            patch("app.common.messaging.service.repo.find_conversation", return_value=None),
            patch(
                "app.common.messaging.service.repo.create_conversation",
                side_effect=APIError({"code": "42501", "message": "new row violates row-level security policy"}),
            ),
        ):
            response = client.post(
                "/api/v1/messaging/conversations",
                json={
                    "other_user_id": "00000000-0000-4000-8000-000000000002",
                    "context_type": "listing",
                    "context_id": "00000000-0000-4000-8000-0000000000a1",
                },
            )
    finally:
        app.dependency_overrides.pop(require_authenticated_user, None)
    assert response.status_code == 403
