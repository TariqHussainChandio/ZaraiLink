"""A6 on the real stack: a farmer's AI scan routed to an expert (BR-13), the Expert Assessment kept apart from the AI
report (SRDS §34-§36), and the admin's AI activity counts (SRDS §37).

Real FastAPI, real local Supabase: the photo goes to the `disease-images` bucket as the farmer, the model runs on it,
and every refusal below comes from the database's own policies, as two different users."""

from __future__ import annotations

import io
import os

import httpx
import pytest
from PIL import Image

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")


@pytest.fixture(scope="module")
def activity_before(world, api_client) -> dict:
    response = api_client("GET", "/api/v1/admin/ai-activity", world.admin.token)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture(scope="module")
def scanned_case(world, api_client, activity_before) -> str:
    """The farmer's own disease case with a real prediction."""
    buffer = io.BytesIO()
    Image.new("RGB", (64, 64), (60, 120, 40)).save(buffer, format="JPEG")
    path = f"{world.farmer.id}/a6-assessment-leaf.jpg"
    upload = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/disease-images/{path}",
        headers={
            "apikey": ANON_KEY,
            "Authorization": f"Bearer {world.farmer.token}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        },
        content=buffer.getvalue(),
        timeout=30,
    )
    assert upload.status_code in (200, 201), upload.text
    case = api_client("POST", "/api/v1/disease/cases", world.farmer.token, json={"storage_path": path})
    assert case.status_code == 200, case.text
    case_id = case.json()["id"]
    predicted = api_client("POST", "/api/v1/disease/predict", world.farmer.token, json={"disease_case_id": case_id})
    assert predicted.status_code == 200, f"the model must be loaded for this proof: {predicted.text}"
    return case_id


@pytest.fixture(scope="module")
def referral(world, api_client, scanned_case) -> str:
    """A consultation that carries the case, accepted by the assigned expert."""
    created = api_client(
        "POST",
        "/api/v1/consultations",
        world.farmer.token,
        json={
            "expert_id": world.expert.id,
            "subject": "Is the scan right?",
            "problem_description": "The app says this is a disease; please check.",
            "disease_case_id": scanned_case,
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["disease_case_id"] == scanned_case
    consultation_id = created.json()["id"]
    accepted = api_client(
        "PATCH", f"/api/v1/consultations/{consultation_id}/status", world.expert.token, json={"to": "accepted"}
    )
    assert accepted.status_code == 204, accepted.text
    return consultation_id


_OTHER_EXPERT: dict[str, str] = {}


@pytest.fixture
def other_expert(world, api_client, make_applicant, fresh_sign_in) -> str:
    """A second approved expert, not assigned to the consultation: applies, is approved, signs in again (made once
    and reused; make_applicant is function-scoped, so the token is kept here rather than in a module fixture)."""
    if "token" not in _OTHER_EXPERT:
        expert_id, email, _ = make_applicant("expert")
        approved = api_client(
            "PATCH",
            f"/api/v1/expert/admin/{expert_id}/verification",
            world.admin.token,
            json={"decision": "approved", "notes": "A6 smoke"},
        )
        assert approved.status_code == 200, approved.text
        _OTHER_EXPERT["token"] = fresh_sign_in(email)
    return _OTHER_EXPERT["token"]


def test_a_farmer_cannot_attach_someone_elses_case(world, api_client, scanned_case):
    refused = api_client(
        "POST",
        "/api/v1/consultations",
        world.buyer.token,
        json={"expert_id": world.expert.id, "subject": "Not my case", "disease_case_id": scanned_case},
    )
    assert refused.status_code == 403, refused.text


def test_the_assigned_expert_sees_the_ai_report(world, api_client, referral, scanned_case):
    detail = api_client("GET", f"/api/v1/consultations/{referral}", world.expert.token)
    assert detail.status_code == 200, detail.text
    report = detail.json()["ai_report"]
    assert report is not None, "the assigned expert must see the AI result attached to the consultation"
    assert report["case_id"] == scanned_case
    assert report["image_url"]
    assert report["report"]["class_label"]
    assert report["report"]["disclaimer"]  # BR-13: every report says it is advisory


def test_another_expert_cannot_read_the_consultation_or_its_case(api_client, referral, scanned_case, other_expert):
    assert api_client("GET", f"/api/v1/consultations/{referral}", other_expert).status_code == 404
    assert api_client("GET", f"/api/v1/disease/cases/{scanned_case}", other_expert).status_code == 404


def test_the_expert_agrees_then_corrects_with_a_diagnosis(world, api_client, referral):
    agree = api_client(
        "POST",
        f"/api/v1/consultations/{referral}/assessments",
        world.expert.token,
        json={"verdict": "agree", "recommendations": "Spray copper fungicide weekly."},
    )
    assert agree.status_code == 201, agree.text
    assert agree.json()["expert_id"] == world.expert.id
    assert agree.json()["diagnosis"] is None

    correct = api_client(
        "POST",
        f"/api/v1/consultations/{referral}/assessments",
        world.expert.token,
        json={"verdict": "correct", "diagnosis": "Septoria leaf spot", "recommendations": "Remove lower leaves."},
    )
    assert correct.status_code == 201, correct.text
    assert correct.json()["diagnosis"] == "Septoria leaf spot"


def test_a_correction_without_a_diagnosis_is_a_422(world, api_client, referral):
    missing = api_client(
        "POST", f"/api/v1/consultations/{referral}/assessments", world.expert.token, json={"verdict": "correct"}
    )
    assert missing.status_code == 422, missing.text
    blank = api_client(
        "POST",
        f"/api/v1/consultations/{referral}/assessments",
        world.expert.token,
        json={"verdict": "additional_diagnosis", "diagnosis": "   "},
    )
    assert blank.status_code == 422, blank.text


def test_another_expert_and_the_farmer_cannot_assess(world, api_client, referral, other_expert):
    by_other = api_client(
        "POST", f"/api/v1/consultations/{referral}/assessments", other_expert, json={"verdict": "agree"}
    )
    assert by_other.status_code == 403, by_other.text
    by_farmer = api_client(
        "POST", f"/api/v1/consultations/{referral}/assessments", world.farmer.token, json={"verdict": "agree"}
    )
    assert by_farmer.status_code == 403, by_farmer.text


def test_the_farmer_reads_the_ai_report_and_the_assessments_apart(world, api_client, referral):
    detail = api_client("GET", f"/api/v1/consultations/{referral}", world.farmer.token)
    assert detail.status_code == 200, detail.text
    assert detail.json()["ai_report"] is not None

    assessments = api_client("GET", f"/api/v1/consultations/{referral}/assessments", world.farmer.token)
    assert assessments.status_code == 200, assessments.text
    rows = assessments.json()
    # Newest first: the correction is the expert's current answer; the AI report itself is untouched.
    assert [row["verdict"] for row in rows] == ["correct", "agree"]
    assert all(row["expert_id"] == world.expert.id for row in rows)
    assert detail.json()["ai_report"]["report"]["class_label"] != "Septoria leaf spot"


def test_someone_outside_the_consultation_reads_no_assessments(api_client, referral, other_expert):
    outside = api_client("GET", f"/api/v1/consultations/{referral}/assessments", other_expert)
    assert outside.status_code == 200
    assert outside.json() == []


def test_the_farmer_was_notified_of_the_assessment(world, api_client, referral):
    notifications = api_client("GET", "/api/v1/notifications", world.farmer.token)
    assert notifications.status_code == 200, notifications.text
    assert any(n.get("type") == "consultation_assessed" for n in notifications.json())


def test_admin_ai_activity_counts_the_scan_and_the_referral(world, api_client, referral, activity_before):
    after = api_client("GET", "/api/v1/admin/ai-activity", world.admin.token)
    assert after.status_code == 200, after.text
    body = after.json()
    # At least: other lanes may scan in parallel on the same local stack.
    assert body["scans"] - activity_before["scans"] >= 1
    assert body["predicted"] - activity_before["predicted"] >= 1
    assert body["referrals"] - activity_before["referrals"] >= 1
    assert body["days"][-1]["scans"] >= 1
    assert body["days"][-1]["referrals"] >= 1
    assert sum(day["scans"] for day in body["days"]) == body["scans"]


def test_ai_activity_is_refused_to_a_non_admin(world, api_client):
    assert api_client("GET", "/api/v1/admin/ai-activity", world.farmer.token).status_code == 403
    assert api_client("GET", "/api/v1/admin/ai-activity", world.expert.token).status_code == 403
