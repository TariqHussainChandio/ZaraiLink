"""P5 (item 5) — limit/offset and the Link: rel="next" header on list endpoints, on the real stack."""

from __future__ import annotations


def _seed_notifications_free_list(world, api_client, count):
    """Give the buyer `count` orders so /orders has something to page through."""
    for _ in range(count):
        response = api_client(
            "POST",
            "/api/v1/orders/checkout",
            world.buyer.token,
            json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
        )
        assert response.status_code == 200, response.text


def test_limit_and_offset_page_through_a_list_without_overlap(world, api_client):
    _seed_notifications_free_list(world, api_client, 5)
    everything = api_client("GET", "/api/v1/orders", world.buyer.token).json()
    assert len(everything) >= 5
    first = api_client("GET", "/api/v1/orders?limit=2&offset=0", world.buyer.token).json()
    second = api_client("GET", "/api/v1/orders?limit=2&offset=2", world.buyer.token).json()
    assert [o["id"] for o in first] == [o["id"] for o in everything[:2]]
    assert [o["id"] for o in second] == [o["id"] for o in everything[2:4]]


def test_a_full_page_announces_the_next_page_and_a_short_page_does_not(world, api_client):
    _seed_notifications_free_list(world, api_client, 3)
    full = api_client("GET", "/api/v1/orders?limit=2", world.buyer.token)
    assert full.headers["Link"].endswith('rel="next"')
    assert "offset=2" in full.headers["Link"]
    assert "limit=2" in full.headers["Link"]

    total = len(api_client("GET", "/api/v1/orders", world.buyer.token).json())
    last = api_client("GET", f"/api/v1/orders?limit=100&offset={max(total - 1, 0)}", world.buyer.token)
    assert "Link" not in last.headers


def test_offset_past_the_end_is_an_empty_list_not_an_error(world, api_client):
    response = api_client("GET", "/api/v1/orders?offset=100000", world.buyer.token)
    assert response.status_code == 200
    assert response.json() == []


def test_the_limit_ceiling_and_bad_values_are_rejected(world, api_client):
    assert api_client("GET", "/api/v1/orders?limit=101", world.buyer.token).status_code == 422
    assert api_client("GET", "/api/v1/orders?limit=0", world.buyer.token).status_code == 422
    assert api_client("GET", "/api/v1/orders?offset=-1", world.buyer.token).status_code == 422


def test_public_lists_page_too(api_client):
    one = api_client("GET", "/api/v1/marketplace/categories?limit=1")
    assert one.status_code == 200
    assert len(one.json()) == 1


def test_the_marketplace_feed_keeps_its_historical_page_size_of_20(api_client):
    assert len(api_client("GET", "/api/v1/marketplace/listings").json()) <= 20
    assert len(api_client("GET", "/api/v1/marketplace/listings?limit=1").json()) == 1


def test_a_users_orders_stay_scoped_when_paging(world, api_client):
    # Paging must not widen access: another buyer's pages never contain this buyer's orders.
    mine = {o["id"] for o in api_client("GET", "/api/v1/orders?limit=100", world.buyer.token).json()}
    theirs = {o["id"] for o in api_client("GET", "/api/v1/orders?limit=100", world.buyer2.token).json()}
    assert mine
    assert not (mine & theirs)


def test_analytics_endpoints_still_respond_alongside_paginated_lists(world, api_client):
    # Only proves the aggregate route still works; that no page leaks into it rests on the design (no
    # pagination dependency on those routes, so page_range() stays unbounded), not on this assert.
    stats = api_client("GET", "/api/v1/analytics/admin", world.admin.token)
    assert stats.status_code == 200, stats.text
