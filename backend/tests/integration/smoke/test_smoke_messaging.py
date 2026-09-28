"""P5a smoke matrix — messaging domain. Also exercises the participant-embed half of the
profiles_public fix (see conftest.py's world fixture comment and the repository-level comments in
common/messaging/repository.py)."""

from __future__ import annotations


def test_find_or_create_conversation_then_list_resolves_participant_embeds(world, api_client):
    created = api_client(
        "POST", "/api/v1/messaging/conversations", world.buyer.token, json={"other_user_id": world.farmer.id}
    )
    assert created.status_code in (200, 201), created.text
    conversation_id = created.json()["id"]
    world.extra["conversation_id"] = conversation_id

    listed = api_client("GET", "/api/v1/messaging/conversations", world.buyer.token)
    assert listed.status_code == 200, listed.text
    mine = [c for c in listed.json() if c["id"] == conversation_id]
    assert len(mine) == 1
    assert mine[0]["otherParticipant"]["id"] == world.farmer.id
    assert mine[0]["otherParticipant"]["full_name"]


def test_send_and_list_messages(world, api_client):
    conversation_id = world.extra["conversation_id"]
    sent = api_client(
        "POST",
        f"/api/v1/messaging/conversations/{conversation_id}/messages",
        world.buyer.token,
        json={"body": "Hello, is this still available?"},
    )
    assert sent.status_code == 200, sent.text
    message_id = sent.json()["id"]

    messages = api_client("GET", f"/api/v1/messaging/conversations/{conversation_id}/messages", world.farmer.token)
    assert messages.status_code == 200
    assert any(m["id"] == message_id for m in messages.json())

    single = api_client("GET", f"/api/v1/messaging/messages/{message_id}", world.farmer.token)
    assert single.status_code == 200, single.text


def test_mark_conversation_read(world, api_client):
    conversation_id = world.extra["conversation_id"]
    response = api_client("PATCH", f"/api/v1/messaging/conversations/{conversation_id}/read", world.farmer.token)
    assert response.status_code == 204, response.text


def test_admin_can_redact_a_message(world, api_client):
    conversation_id = world.extra["conversation_id"]
    sent = api_client(
        "POST",
        f"/api/v1/messaging/conversations/{conversation_id}/messages",
        world.buyer.token,
        json={"body": "something moderation-worthy"},
    )
    assert sent.status_code == 200, sent.text
    message_id = sent.json()["id"]

    redacted = api_client("PATCH", f"/api/v1/messaging/messages/{message_id}/redact", world.admin.token)
    assert redacted.status_code == 204, redacted.text


def test_non_participant_cannot_send_a_message(world, api_client):
    conversation_id = world.extra["conversation_id"]
    response = api_client(
        "POST",
        f"/api/v1/messaging/conversations/{conversation_id}/messages",
        world.buyer2.token,
        json={"body": "I'm not part of this conversation"},
    )
    assert response.status_code in (403, 404)
