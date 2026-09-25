"""P5a smoke matrix — notifications domain. `notifications` has no client insert path (rows only
come from triggers, per notifications.md) — the messaging test above sending a message to the
farmer is what seeds a real row here."""

from __future__ import annotations


def test_list_and_unread_count(world, api_client):
    listed = api_client("GET", "/api/v1/notifications", world.farmer.token)
    assert listed.status_code == 200, listed.text

    count = api_client("GET", "/api/v1/notifications/unread-count", world.farmer.token)
    assert count.status_code == 200, count.text
    assert "count" in count.json()


def test_mark_one_read_and_mark_all_read(world, api_client):
    listed = api_client("GET", "/api/v1/notifications", world.farmer.token)
    assert listed.status_code == 200
    notifications = listed.json()
    if notifications:
        one = api_client("PATCH", f"/api/v1/notifications/{notifications[0]['id']}/read", world.farmer.token)
        assert one.status_code == 204, one.text

    all_read = api_client("PATCH", "/api/v1/notifications/read-all", world.farmer.token)
    assert all_read.status_code == 204, all_read.text
