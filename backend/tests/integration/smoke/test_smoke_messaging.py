"""P5a smoke matrix — messaging domain. Also exercises the participant-embed half of the
profiles_public fix (see conftest.py's world fixture comment and the repository-level comments in
common/messaging/repository.py).

A5 (SRDS §30): a conversation starts only from a listing (the asker towards its owner), an order (its buyer and its
seller) or a consultation (its requester and its expert). `conversations_insert_related`
(20261020080000_conversation_context.sql) enforces it at the database, so every case runs twice: through the API and
straight through PostgREST with the same user's JWT, and both must give the same answer.
"""

from __future__ import annotations

import os

import httpx
import pytest

REST = os.environ.get("LOCAL_SUPABASE_URL", "") + "/rest/v1"
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
CONVERSATIONS = "/api/v1/messaging/conversations"
TRANSPORTS = ("api", "postgrest")


def rest_insert(token: str, row: dict) -> httpx.Response:
    headers = {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    return httpx.post(f"{REST}/conversations", headers=headers, json=row, timeout=30)


def open_conversation(api_client, transport: str, caller, other_id: str, context_type: str, context_id: str):
    """Opens a conversation as `caller` (id, token) through the API or PostgREST; returns (status, body)."""
    caller_id, token = caller
    if transport == "api":
        response = api_client(
            "POST",
            CONVERSATIONS,
            token,
            json={"other_user_id": other_id, "context_type": context_type, "context_id": context_id},
        )
        return response.status_code, response.json()
    response = rest_insert(
        token,
        {
            "participant_one": caller_id,
            "participant_two": other_id,
            "context_type": context_type,
            "context_id": context_id,
        },
    )
    body = response.json()
    return response.status_code, (body[0] if isinstance(body, list) and body else body)


def assert_refused(transport: str, status: int, body) -> None:
    if transport == "api":
        assert status == 403, body
    else:
        # PostgREST answers an RLS refusal for a signed-in user with 403 and the Postgres code.
        assert status == 403, body
        assert body.get("code") == "42501", body


def place_order(api_client, world, buyer_token: str) -> str:
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        buyer_token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}], "delivery_charge_by_seller": {}},
    )
    assert checkout.status_code in (200, 201), checkout.text
    orders = checkout.json()
    return (orders[0] if isinstance(orders, list) else orders)["id"]


def request_consultation(api_client, world, requester_token: str) -> str:
    request = api_client(
        "POST",
        "/api/v1/consultations",
        requester_token,
        json={
            "expert_id": world.expert.id,
            "subject": "Smoke messaging consultation",
            "crop_id": None,
            "problem_description": "spots on the leaves",
            "priority": "medium",
        },
    )
    assert request.status_code == 200, request.text
    return request.json()["id"]


# ------------------------------------------------------------------ the session's main thread


def test_listing_inquiry_then_list_resolves_participant_embeds(world, api_client):
    created = api_client(
        "POST",
        CONVERSATIONS,
        world.buyer.token,
        json={"other_user_id": world.farmer.id, "context_type": "listing", "context_id": world.farmer_listing_id},
    )
    assert created.status_code in (200, 201), created.text
    conversation_id = created.json()["id"]
    world.extra["conversation_id"] = conversation_id

    listed = api_client("GET", CONVERSATIONS, world.buyer.token)
    assert listed.status_code == 200, listed.text
    mine = [c for c in listed.json() if c["id"] == conversation_id]
    assert len(mine) == 1
    assert mine[0]["otherParticipant"]["id"] == world.farmer.id
    assert mine[0]["otherParticipant"]["full_name"]


def test_an_existing_pair_reuses_its_thread(world, api_client):
    # The owner could not open this thread (cold message from a listing), but a pair that already talks keeps one
    # thread whoever asks; the thread keeps the context it was opened with.
    again = api_client(
        "POST",
        CONVERSATIONS,
        world.farmer.token,
        json={"other_user_id": world.buyer.id, "context_type": "listing", "context_id": world.farmer_listing_id},
    )
    assert again.status_code == 200, again.text
    body = again.json()
    assert body["id"] == world.extra["conversation_id"]
    assert body["context_type"] == "listing"
    assert body["context_id"] == world.farmer_listing_id


def test_send_and_list_messages(world, api_client):
    conversation_id = world.extra["conversation_id"]
    sent = api_client(
        "POST",
        f"{CONVERSATIONS}/{conversation_id}/messages",
        world.buyer.token,
        json={"body": "Hello, is this still available?"},
    )
    assert sent.status_code == 200, sent.text
    message_id = sent.json()["id"]

    messages = api_client("GET", f"{CONVERSATIONS}/{conversation_id}/messages", world.farmer.token)
    assert messages.status_code == 200
    assert any(m["id"] == message_id for m in messages.json())

    single = api_client("GET", f"/api/v1/messaging/messages/{message_id}", world.farmer.token)
    assert single.status_code == 200, single.text


def test_mark_conversation_read(world, api_client):
    conversation_id = world.extra["conversation_id"]
    response = api_client("PATCH", f"{CONVERSATIONS}/{conversation_id}/read", world.farmer.token)
    assert response.status_code == 204, response.text


def test_admin_can_redact_a_message(world, api_client):
    conversation_id = world.extra["conversation_id"]
    sent = api_client(
        "POST",
        f"{CONVERSATIONS}/{conversation_id}/messages",
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
        f"{CONVERSATIONS}/{conversation_id}/messages",
        world.buyer2.token,
        json={"body": "I'm not part of this conversation"},
    )
    assert response.status_code in (403, 404)


# ------------------------------------------------------------------ A5: who may open a conversation
# Every case uses fresh users, so no earlier thread between the pair can answer for the policy.


@pytest.mark.parametrize("transport", TRANSPORTS)
def test_a_listing_inquiry_towards_the_owner_is_allowed(transport, world, api_client, make_actor):
    asker_id, _, asker_token = make_actor("buyer")
    status, body = open_conversation(
        api_client, transport, (asker_id, asker_token), world.farmer.id, "listing", world.farmer_listing_id
    )
    assert status in (200, 201), body
    assert body["context_type"] == "listing"
    assert body["context_id"] == world.farmer_listing_id
    assert {body["participant_one"], body["participant_two"]} == {asker_id, world.farmer.id}


@pytest.mark.parametrize("transport", TRANSPORTS)
def test_the_seller_may_message_the_buyer_of_an_order(transport, world, api_client, make_actor):
    buyer_id, _, buyer_token = make_actor("buyer")
    order_id = place_order(api_client, world, buyer_token)
    status, body = open_conversation(
        api_client, transport, (world.farmer.id, world.farmer.token), buyer_id, "order", order_id
    )
    assert status in (200, 201), body
    assert body["context_type"] == "order"
    assert body["context_id"] == order_id


@pytest.mark.parametrize("transport", TRANSPORTS)
def test_the_expert_may_message_the_requester_of_a_consultation(transport, world, api_client, make_actor):
    requester_id, _, requester_token = make_actor("farmer")
    consultation_id = request_consultation(api_client, world, requester_token)
    status, body = open_conversation(
        api_client, transport, (world.expert.id, world.expert.token), requester_id, "consultation", consultation_id
    )
    assert status in (200, 201), body
    assert body["context_type"] == "consultation"
    assert body["context_id"] == consultation_id


@pytest.mark.parametrize("transport", TRANSPORTS)
def test_an_owner_cannot_cold_message_from_their_listing(transport, world, api_client, make_actor):
    stranger_id = make_actor("buyer")[0]
    status, body = open_conversation(
        api_client, transport, (world.farmer.id, world.farmer.token), stranger_id, "listing", world.farmer_listing_id
    )
    assert_refused(transport, status, body)


@pytest.mark.parametrize("transport", TRANSPORTS)
def test_an_unrelated_pair_is_refused_whatever_the_context(transport, world, api_client, make_actor):
    # buyer2 cites real rows they have no part in: a listing whose owner is not the other person, someone else's order
    # and someone else's consultation.
    other_id, _, other_token = make_actor("buyer")
    order_id = place_order(api_client, world, other_token)
    requester_token = make_actor("farmer")[2]
    consultation_id = request_consultation(api_client, world, requester_token)
    caller = (world.buyer2.id, world.buyer2.token)

    for other, context_type, context_id in (
        (other_id, "listing", world.farmer_listing_id),
        (world.farmer.id, "order", order_id),
        (world.expert.id, "consultation", consultation_id),
    ):
        status, body = open_conversation(api_client, transport, caller, other, context_type, context_id)
        assert_refused(transport, status, body)


def test_postgrest_refuses_a_row_without_the_caller_or_without_a_context(world, make_actor):
    asker_id = make_actor("buyer")[0]
    # Someone else's legitimate inquiry, written by a third person.
    spoofed = rest_insert(
        world.buyer2.token,
        {
            "participant_one": asker_id,
            "participant_two": world.farmer.id,
            "context_type": "listing",
            "context_id": world.farmer_listing_id,
        },
    )
    assert spoofed.status_code == 403, spoofed.text
    assert spoofed.json().get("code") == "42501", spoofed.text
    # The pre-A5 shape: no context at all.
    bare = rest_insert(world.buyer2.token, {"participant_one": world.buyer2.id, "participant_two": asker_id})
    assert bare.status_code == 403, bare.text
    assert bare.json().get("code") == "42501", bare.text


def test_the_api_requires_a_known_context(world, api_client):
    for body in (
        {"other_user_id": world.farmer.id},
        {"other_user_id": world.farmer.id, "context_type": "listing"},
        {"other_user_id": world.farmer.id, "context_type": "store", "context_id": world.dealer_store_id},
    ):
        response = api_client("POST", CONVERSATIONS, world.buyer2.token, json=body)
        assert response.status_code == 422, response.text


def test_malformed_ids_and_messaging_yourself_are_client_errors(world, api_client):
    # A bad id or a self-conversation is the caller's mistake, never a server error.
    listing = world.farmer_listing_id
    for token, body in (
        (world.buyer2.token, {"other_user_id": world.farmer.id, "context_type": "listing", "context_id": "not-a-uuid"}),
        (world.buyer2.token, {"other_user_id": "not-a-uuid", "context_type": "listing", "context_id": listing}),
        # The owner citing their own listing passes the policy; the distinct-participants check must still answer.
        (world.farmer.token, {"other_user_id": world.farmer.id, "context_type": "listing", "context_id": listing}),
    ):
        response = api_client("POST", CONVERSATIONS, token, json=body)
        assert 400 <= response.status_code < 500, (body, response.status_code, response.text)
