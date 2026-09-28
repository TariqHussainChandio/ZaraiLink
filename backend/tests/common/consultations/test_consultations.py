from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser
from app.common.consultations import service
from app.main import app

client = TestClient(app)

REQUESTER = AuthenticatedUser(id="user-1", email="u@x.com", role="farmer", access_token="tok")
EXPERT = AuthenticatedUser(id="expert-1", email="e@x.com", role="expert", access_token="tok2")
STRANGER = AuthenticatedUser(id="stranger-1", email="s@x.com", role="buyer", access_token="tok3")

REQUESTED_CONSULTATION = {
    "id": "c-1",
    "user_id": REQUESTER.id,
    "expert_id": EXPERT.id,
    "status": "requested",
}


@pytest.mark.asyncio
async def test_requester_cannot_accept_their_own_consultation():
    # Before this migration, RLS only checked "is a participant" — a requester calling this
    # directly (bypassing the UI, which just hides the button) could previously have accepted
    # their own request. This is the regression test for that closed gap.
    with patch("app.common.consultations.service.repo.get_by_id", return_value=REQUESTED_CONSULTATION):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_status(REQUESTER, "c-1", "accepted")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_expert_can_accept_a_requested_consultation():
    with patch("app.common.consultations.service.repo.get_by_id", return_value=REQUESTED_CONSULTATION):
        with patch("app.common.consultations.service.repo.update_status") as mock_update:
            await service.update_status(EXPERT, "c-1", "accepted")
    mock_update.assert_called_once_with(EXPERT.access_token, "c-1", "accepted")


@pytest.mark.asyncio
async def test_expert_cannot_cancel_a_requested_consultation_only_requester_can():
    with patch("app.common.consultations.service.repo.get_by_id", return_value=REQUESTED_CONSULTATION):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_status(EXPERT, "c-1", "cancelled")
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_requester_can_cancel_a_requested_consultation():
    with patch("app.common.consultations.service.repo.get_by_id", return_value=REQUESTED_CONSULTATION):
        with patch("app.common.consultations.service.repo.update_status") as mock_update:
            await service.update_status(REQUESTER, "c-1", "cancelled")
    mock_update.assert_called_once_with(REQUESTER.access_token, "c-1", "cancelled")


@pytest.mark.asyncio
async def test_stranger_gets_404_not_a_403_leak():
    # get_by_id uses the caller's own RLS-scoped client, so a non-participant naturally gets
    # None back (RLS hides the row), not a 403 that would confirm the id exists.
    with patch("app.common.consultations.service.repo.get_by_id", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_status(STRANGER, "c-1", "accepted")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_invalid_transition_rejected_with_422():
    with patch("app.common.consultations.service.repo.get_by_id", return_value=REQUESTED_CONSULTATION):
        with pytest.raises(HTTPException) as exc_info:
            await service.update_status(EXPERT, "c-1", "closed")  # requested -> closed is never valid
    assert exc_info.value.status_code == 422


def test_every_non_empty_allowed_transition_has_an_actor_mapped():
    for from_status, targets in service.ALLOWED_TRANSITIONS.items():
        for to_status in targets:
            assert (from_status, to_status) in service.TRANSITION_ACTOR, (
                f"({from_status!r}, {to_status!r}) is a valid transition with no actor mapped — "
                "would default-deny at runtime, but should be explicit here instead of relying on that."
            )


@pytest.mark.asyncio
async def test_send_message_uses_callers_own_id_as_sender():
    with patch("app.common.consultations.service.repo.send_message", return_value={"id": "m-1"}) as mock_send:
        await service.send_message(REQUESTER, "c-1", "hello", [], None)
    args, _ = mock_send.call_args
    assert args[2] == REQUESTER.id


def test_create_request_without_authorization_header_is_rejected():
    response = client.post("/api/v1/consultations", json={"expert_id": "e-1", "subject": "help"})
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_a_request_to_an_expert_who_is_not_verified_is_refused_and_nothing_is_written():
    # The public expert read shows approved experts only, so `None` is a pending, rejected or unknown expert.
    with (
        patch("app.expert.service.repo.fetch_expert_by_id", return_value=None),
        patch("app.common.consultations.service.repo.create_request") as mock_create,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.create_request(REQUESTER, {"expert_id": "expert-9", "subject": "s"})
    assert exc_info.value.status_code == 404
    mock_create.assert_not_called()


@pytest.mark.asyncio
async def test_a_request_to_a_verified_expert_is_created():
    with (
        patch("app.expert.service.repo.fetch_expert_by_id", return_value={"id": "expert-1"}),
        patch("app.common.consultations.service.repo.create_request", return_value={"id": "c-1"}) as mock_create,
    ):
        result = await service.create_request(REQUESTER, {"expert_id": "expert-1", "subject": "s"})
    assert result == {"id": "c-1"}
    mock_create.assert_called_once()
