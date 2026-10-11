"""P6 (item 5) — Realtime `postgres_changes` delivery is governed by row-level security.

The mobile app subscribes to `messages`, `notifications` and `consultation_messages` changes straight from
Supabase Realtime (frontend/hooks/realtime/). The database publishes those three tables, so each subscriber only
hears about a change if its own JWT could `select` that row. Each case opens real WebSocket subscriptions as a
participant, a stranger and anon, causes a real insert, and checks who was told. No broadcast, presence or
private-channel feature is used anywhere in the app, so there is nothing else to secure.
"""

from __future__ import annotations

import asyncio
import uuid

import httpx
import pytest
from conftest import ANON_KEY, LOCAL_URL, _auth_headers
from realtime import AsyncRealtimeClient

WAIT = 6.0  # seconds to wait for an event that should arrive
QUIET = 3.0  # seconds to keep listening for one that should not

pytestmark = pytest.mark.asyncio


async def subscribe(token: str | None, table: str, sink: list) -> AsyncRealtimeClient:
    """A Realtime client authenticated as the given user (None = anon) listening to inserts on one table."""
    client = AsyncRealtimeClient(LOCAL_URL.replace("http", "ws", 1) + "/realtime/v1", token=ANON_KEY)
    await client.connect()
    if token:
        await client.set_auth(token)
    ready = asyncio.Event()
    channel = client.channel(f"rls-{table}-{uuid.uuid4().hex[:8]}")
    channel.on_postgres_changes("INSERT", lambda payload: sink.append(payload), table=table, schema="public")
    await channel.subscribe(lambda status, _err: ready.set() if str(status).endswith("SUBSCRIBED") else None)
    await asyncio.wait_for(ready.wait(), timeout=10)
    await asyncio.sleep(1.0)  # let the server finish registering the subscription
    return client


async def heard(sink: list, needle: str, seconds: float) -> bool:
    for _ in range(int(seconds * 10)):
        if any(needle in str(p) for p in sink):
            return True
        await asyncio.sleep(0.1)
    return False


async def test_a_message_is_delivered_to_its_participants_only(world, api_client):
    conversation = api_client(
        "POST",
        "/api/v1/messaging/conversations",
        world.buyer.token,
        json={"other_user_id": world.farmer.id, "context_type": "listing", "context_id": world.farmer_listing_id},
    )
    assert conversation.status_code == 200, conversation.text
    marker = f"realtime-{uuid.uuid4().hex}"
    farmer_sink, stranger_sink, anon_sink = [], [], []
    clients = [
        await subscribe(world.farmer.token, "messages", farmer_sink),
        await subscribe(world.buyer2.token, "messages", stranger_sink),
        await subscribe(None, "messages", anon_sink),
    ]
    try:
        sent = api_client(
            "POST",
            f"/api/v1/messaging/conversations/{conversation.json()['id']}/messages",
            world.buyer.token,
            json={"body": marker},
        )
        assert sent.status_code == 200, sent.text
        assert await heard(farmer_sink, marker, WAIT), "the other participant was not told"
        assert not await heard(stranger_sink, marker, QUIET), "a stranger was told about a private message"
        assert not await heard(anon_sink, marker, QUIET), "anon was told about a private message"
    finally:
        for client in clients:
            await client.close()


async def test_a_notification_is_delivered_to_its_owner_only(world, api_client):
    farmer_sink, stranger_sink = [], []
    clients = [
        await subscribe(world.farmer.token, "notifications", farmer_sink),
        await subscribe(world.buyer2.token, "notifications", stranger_sink),
    ]
    try:
        # A new order notifies its seller (trigger notify_new_order), so the farmer, not buyer2, is told.
        checkout = api_client(
            "POST",
            "/api/v1/orders/checkout",
            world.buyer.token,
            json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
        )
        assert checkout.status_code == 200, checkout.text
        order_id = checkout.json()[0]["id"]
        assert await heard(farmer_sink, order_id, WAIT), "the seller was not told about their new order"
        assert not await heard(stranger_sink, order_id, QUIET), "a stranger was told about someone else's notification"
    finally:
        for client in clients:
            await client.close()


async def test_a_consultation_message_is_delivered_to_its_participants_only(world):
    headers = {**_auth_headers(world.buyer.token), "Prefer": "return=representation"}
    async with httpx.AsyncClient(base_url=LOCAL_URL, timeout=30) as http:
        created = await http.post(
            "/rest/v1/consultations",
            headers=headers,
            json={"user_id": world.buyer.id, "expert_id": world.expert.id, "subject": "Realtime check"},
        )
        created.raise_for_status()
        consultation_id = created.json()[0]["id"]
        # The requester and the verified expert are the two participants; nobody else is.

        marker = f"realtime-{uuid.uuid4().hex}"
        expert_sink, stranger_sink = [], []
        clients = [
            await subscribe(world.expert.token, "consultation_messages", expert_sink),
            await subscribe(world.buyer2.token, "consultation_messages", stranger_sink),
        ]
        try:
            (
                await http.post(
                    "/rest/v1/consultation_messages",
                    headers=headers,
                    json={"consultation_id": consultation_id, "sender_id": world.buyer.id, "body": marker},
                )
            ).raise_for_status()
            assert await heard(expert_sink, marker, WAIT), "the expert was not told"
            assert not await heard(stranger_sink, marker, QUIET), "a stranger was told about a consultation message"
        finally:
            for client in clients:
                await client.close()
