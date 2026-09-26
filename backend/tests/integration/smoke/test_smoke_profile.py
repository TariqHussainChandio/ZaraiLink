"""P5a smoke matrix — profile domain (the generic own-profile update endpoint, shared across all
roles)."""

from __future__ import annotations


def test_update_own_profile(world, api_client):
    response = api_client(
        "PATCH", "/api/v1/profile", world.buyer.token, json={"full_name": "Smoke Buyer Updated", "city": "Lahore"}
    )
    assert response.status_code == 204, response.text


def test_cannot_self_assign_role_via_profile_endpoint(world, api_client, find_profile):
    # ProfileUpdateRequest has no `role` field at all — an extra field in the JSON body is
    # silently ignored by pydantic rather than erroring, so the real proof is that the role
    # genuinely never changes, not just that the call itself returns 204.
    response = api_client(
        "PATCH", "/api/v1/profile", world.buyer.token, json={"full_name": "Still Buyer", "role": "admin"}
    )
    assert response.status_code == 204, response.text

    buyer_row = find_profile(world.buyer.id)
    assert buyer_row is not None
    assert buyer_row["role"] == "buyer"
