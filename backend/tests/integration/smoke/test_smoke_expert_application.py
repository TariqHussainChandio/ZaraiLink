"""An expert who has applied but is not yet approved must still see their own profile.

Found by the P7 (7D) real-stack hook test: `GET /expert/me` read with the anonymous client, which row-level security
limits to approved experts, so a pending applicant got `null` back. The app then offered a second application and never
showed the "pending review" banner. The shared `world.expert` is approved, so it never showed this.
"""

from __future__ import annotations

APPLICATION = {
    "qualifications": "BSc Agriculture",
    "degree": "BSc",
    "experience": "5 years",
    "professional_description": "Wheat and rice",
    "contact": "expert@example.test",
    "specializations": ["plant_diseases"],
}


def test_a_pending_applicant_sees_their_own_profile_and_a_stranger_does_not(make_actor, api_client, world):
    _, _, token = make_actor("expert")
    assert api_client("GET", "/api/v1/expert/me", token).json() is None  # has not applied yet

    applied = api_client("POST", "/api/v1/expert/application", token, json=APPLICATION)
    assert applied.status_code == 200, applied.text
    expert_id = applied.json()["id"]

    own = api_client("GET", "/api/v1/expert/me", token)
    assert own.status_code == 200, own.text
    assert own.json()["id"] == expert_id
    assert own.json()["verification_status"] == "pending"
    assert [s["specialization"] for s in own.json()["expert_specializations"]] == ["plant_diseases"]

    # everyone else still cannot see a profile that has not been approved
    assert api_client("GET", f"/api/v1/expert/{expert_id}", world.farmer.token).status_code in (403, 404)
    directory = api_client("GET", "/api/v1/expert", world.farmer.token)
    assert expert_id not in [expert["id"] for expert in directory.json()]


def test_a_consultation_cannot_be_requested_from_an_expert_who_is_not_verified(make_actor, api_client, world):
    _, _, token = make_actor("expert")
    applied = api_client("POST", "/api/v1/expert/application", token, json=APPLICATION)
    assert applied.status_code == 200, applied.text
    request = {"expert_id": applied.json()["id"], "subject": "Yellow leaves", "problem_description": "Please help"}

    # rejected path: the expert is still pending; not found, not "forbidden", so nothing is revealed about them
    refused = api_client("POST", "/api/v1/consultations", world.farmer.token, json=request)
    assert refused.status_code == 404, refused.text

    # allowed path: an approved expert can be asked
    allowed = api_client(
        "POST", "/api/v1/consultations", world.farmer.token, json={**request, "expert_id": world.expert.id}
    )
    assert allowed.status_code in (200, 201), allowed.text
