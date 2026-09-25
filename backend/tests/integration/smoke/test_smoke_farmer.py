"""P5a smoke matrix — farmer domain (farms, farm crops, farmer profile)."""

from __future__ import annotations


def test_list_and_get_farm(world, api_client):
    listed = api_client("GET", "/api/v1/farmer/farms", world.farmer.token)
    assert listed.status_code == 200, listed.text
    assert any(f["id"] == world.farm_id for f in listed.json())

    detail = api_client("GET", f"/api/v1/farmer/farms/{world.farm_id}", world.farmer.token)
    assert detail.status_code == 200, detail.text


def test_update_farm(world, api_client):
    response = api_client("PATCH", f"/api/v1/farmer/farms/{world.farm_id}", world.farmer.token, json={"area": 7.5})
    assert response.status_code == 200, response.text
    assert response.json()["area"] == 7.5


def test_create_update_delete_farm_crop(world, api_client):
    crops = api_client("GET", "/api/v1/marketplace/crops", world.farmer.token)
    assert crops.status_code == 200, crops.text
    assert crops.json(), "crops table must have at least one row (seed.sql)"
    crop_id = crops.json()[0]["id"]

    created = api_client(
        "POST",
        f"/api/v1/farmer/farms/{world.farm_id}/crops",
        world.farmer.token,
        json={"crop_id": crop_id, "variety": "smoke variety", "growth_stage": "seedling"},
    )
    assert created.status_code in (200, 201), created.text
    farm_crop_id = created.json()["id"]

    listed = api_client("GET", f"/api/v1/farmer/farms/{world.farm_id}/crops", world.farmer.token)
    assert listed.status_code == 200
    assert any(c["id"] == farm_crop_id for c in listed.json())

    got = api_client("GET", f"/api/v1/farmer/crops/{farm_crop_id}", world.farmer.token)
    assert got.status_code == 200, got.text

    updated = api_client(
        "PATCH", f"/api/v1/farmer/crops/{farm_crop_id}", world.farmer.token, json={"growth_stage": "flowering"}
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["growth_stage"] == "flowering"

    deleted = api_client("DELETE", f"/api/v1/farmer/crops/{farm_crop_id}", world.farmer.token)
    assert deleted.status_code == 204, deleted.text


def test_farmer_profile_upsert_and_read(world, api_client):
    upsert = api_client(
        "PUT",
        "/api/v1/farmer/profile",
        world.farmer.token,
        json={"experience": "10 years", "agricultural_info": "wheat and cotton"},
    )
    assert upsert.status_code == 204, upsert.text

    read = api_client("GET", "/api/v1/farmer/profile", world.farmer.token)
    assert read.status_code == 200, read.text
    assert read.json()["agricultural_info"] == "wheat and cotton"


def test_non_farmer_cannot_create_a_farm(world, api_client):
    response = api_client("POST", "/api/v1/farmer/farms", world.buyer.token, json={"name": "not allowed"})
    assert response.status_code == 403
