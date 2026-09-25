"""
P5a smoke matrix — consultations domain. This is the direct proof for N2: `consultations_
repository.py`'s embedded `expert` relation crashed on every read (PGRST200 — the FK hint pointed
at the wrong table) before the fix, so every one of these calls would have 500'd.
"""

from __future__ import annotations


def test_create_request_assigns_a_real_expert(world, api_client):
    request = api_client(
        "POST",
        "/api/v1/consultations",
        world.farmer.token,
        json={
            "expert_id": world.expert.id,
            "subject": "Smoke consultation",
            "crop_id": None,
            "problem_description": "leaves turning yellow",
            "priority": "medium",
        },
    )
    assert request.status_code == 200, request.text
    body = request.json()
    assert body["expert_id"] == world.expert.id
    assert body["status"] == "requested"
    world.extra["consultation_id"] = body["id"]


def test_requester_list_resolves_the_expert_embed_without_crashing(world, api_client):
    # N2: this is the exact read that 500'd (PGRST200) before the fix.
    listing = api_client("GET", "/api/v1/consultations/mine", world.farmer.token)
    assert listing.status_code == 200, listing.text
    mine = [c for c in listing.json() if c["id"] == world.extra["consultation_id"]]
    assert len(mine) == 1
    assert mine[0]["expert"]["id"] == world.expert.id
    assert mine[0]["expert"]["full_name"]  # flattened, not nested under .profile


def test_expert_list_resolves_the_expert_embed_without_crashing(world, api_client):
    assigned = api_client("GET", "/api/v1/consultations/assigned", world.expert.token)
    assert assigned.status_code == 200, assigned.text
    ids = [c["id"] for c in assigned.json()]
    assert world.extra["consultation_id"] in ids


def test_get_by_id_resolves_the_expert_embed_without_crashing(world, api_client):
    consultation_id = world.extra["consultation_id"]
    detail = api_client("GET", f"/api/v1/consultations/{consultation_id}", world.farmer.token)
    assert detail.status_code == 200, detail.text
    assert detail.json()["expert"]["id"] == world.expert.id


def test_expert_accepts_and_progresses_the_consultation(world, api_client):
    consultation_id = world.extra["consultation_id"]
    accept = api_client(
        "PATCH", f"/api/v1/consultations/{consultation_id}/status", world.expert.token, json={"to": "accepted"}
    )
    assert accept.status_code == 204, accept.text

    in_progress = api_client(
        "PATCH", f"/api/v1/consultations/{consultation_id}/status", world.expert.token, json={"to": "in_progress"}
    )
    assert in_progress.status_code == 204, in_progress.text


def test_send_message_with_recommended_listing_embed(world, api_client):
    consultation_id = world.extra["consultation_id"]
    message = api_client(
        "POST",
        f"/api/v1/consultations/{consultation_id}/messages",
        world.expert.token,
        json={"body": "Try this fungicide", "recommended_listing_id": world.dealer_listing_id},
    )
    assert message.status_code == 200, message.text
    assert message.json()["recommended_listing"]["id"] == world.dealer_listing_id

    history = api_client("GET", f"/api/v1/consultations/{consultation_id}/messages", world.farmer.token)
    assert history.status_code == 200
    assert any(m["body"] == "Try this fungicide" for m in history.json())


def test_consultation_review_after_resolution(world, api_client):
    consultation_id = world.extra["consultation_id"]
    resolve = api_client(
        "PATCH", f"/api/v1/consultations/{consultation_id}/status", world.expert.token, json={"to": "resolved"}
    )
    assert resolve.status_code == 204, resolve.text

    review = api_client(
        "POST",
        "/api/v1/reviews/consultation",
        world.farmer.token,
        json={"consultation_id": consultation_id, "rating": 5, "comment": "Helpful"},
    )
    assert review.status_code in (200, 201), review.text
