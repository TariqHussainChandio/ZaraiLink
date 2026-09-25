"""P5a smoke matrix — expert domain (routes beyond what conftest.py's world fixture already
exercises via the application-submission + approval flow)."""

from __future__ import annotations


def test_get_own_profile(world, api_client):
    response = api_client("GET", "/api/v1/expert/me", world.expert.token)
    assert response.status_code == 200, response.text
    assert response.json()["id"] == world.expert.id


def test_update_profile(world, api_client):
    response = api_client(
        "PATCH",
        "/api/v1/expert/application",
        world.expert.token,
        json={
            "qualifications": "PhD Agronomy, updated",
            "degree": "PhD",
            "experience": "11 years",
            "professional_description": "Smoke-test expert, updated",
            "contact": "smoke@example.test",
            "specializations": ["plant_diseases"],
        },
    )
    assert response.status_code == 200, response.text


def test_public_directory_resolves_the_profile_embed(world, api_client):
    # profiles_public fix: a buyer with no relationship to this expert must still see their name.
    listing = api_client("GET", "/api/v1/expert", world.buyer.token)
    assert listing.status_code == 200, listing.text
    mine = [e for e in listing.json() if e["id"] == world.expert.id]
    assert len(mine) == 1
    assert mine[0]["profile"]["full_name"]


def test_get_single_expert(world, api_client):
    response = api_client("GET", f"/api/v1/expert/{world.expert.id}", world.buyer.token)
    assert response.status_code == 200, response.text
    assert response.json()["profile"]["id"] == world.expert.id


def test_admin_document_url_lookup(world, api_client):
    response = api_client("GET", f"/api/v1/expert/admin/{world.expert.id}/document-url", world.admin.token)
    assert response.status_code == 200, response.text
