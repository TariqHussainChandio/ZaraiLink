"""A6: the Expert Assessment routes and the AI report attached to a consultation (SRDS §34-§36, BR-13).

Unit level: the repository is patched, so these prove the service's mapping of database refusals to HTTP answers and
that an AI-side fault never breaks a consultation read. The real policies are proven in
tests/integration/smoke/test_smoke_consultation_assessments.py."""

from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from storage3.exceptions import StorageApiError

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.common.consultations import service
from app.main import app

client = TestClient(app)

FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok-f")
EXPERT = AuthenticatedUser(id="expert-1", email="e@x.com", role="expert", access_token="tok-e")

ASSESSMENT = {
    "id": "a-1",
    "consultation_id": "c-1",
    "expert_id": EXPERT.id,
    "verdict": "agree",
    "diagnosis": None,
    "recommendations": None,
    "created_at": "2026-10-11T10:00:00+00:00",
}

REPORT = {
    "predicted_disease": "Tomato — Early blight",
    "class_label": "Tomato___Early_blight",
    "crop": "Tomato",
    "disease": "Early blight",
    "confidence_score": 0.91,
    "confidence_band": "confident",
    "is_healthy": False,
    "advisory": "Remove affected leaves.",
    "review_status": "pending_review",
    "disclaimer": "Advisory only.",
    "created_at": "2026-10-11T09:00:00+00:00",
}


def _api_error(code: str) -> APIError:
    return APIError({"message": "refused", "code": code, "hint": None, "details": None})


@pytest.fixture
def as_user():
    def _set(user: AuthenticatedUser) -> None:
        app.dependency_overrides[get_current_user] = lambda: user

    yield _set
    app.dependency_overrides.pop(get_current_user, None)


# --- creating an assessment


def test_the_assigned_expert_adds_an_assessment_with_blank_text_stored_as_null(as_user):
    as_user(EXPERT)
    with patch(
        "app.common.consultations.service.repo.create_assessment", new=AsyncMock(return_value=ASSESSMENT)
    ) as create:
        response = client.post(
            "/api/v1/consultations/c-1/assessments",
            json={"verdict": "agree", "diagnosis": "   ", "recommendations": ""},
        )
    assert response.status_code == 201, response.text
    assert response.json()["verdict"] == "agree"
    # The caller's own token and id are what reach the database; blank text becomes NULL, not an empty string.
    create.assert_awaited_once_with(
        EXPERT.access_token, "c-1", EXPERT.id, {"verdict": "agree", "diagnosis": None, "recommendations": None}
    )


def test_an_rls_refusal_is_a_403(as_user):
    # 42501: the caller is not the assigned expert, or the consultation is not accepted or in progress.
    as_user(FARMER)
    with patch(
        "app.common.consultations.service.repo.create_assessment", new=AsyncMock(side_effect=_api_error("42501"))
    ):
        response = client.post("/api/v1/consultations/c-1/assessments", json={"verdict": "agree"})
    assert response.status_code == 403, response.text


def test_a_correction_without_a_diagnosis_is_a_422(as_user):
    # 23514: consultation_assessments_diagnosis_required.
    as_user(EXPERT)
    with patch(
        "app.common.consultations.service.repo.create_assessment", new=AsyncMock(side_effect=_api_error("23514"))
    ):
        response = client.post("/api/v1/consultations/c-1/assessments", json={"verdict": "correct"})
    assert response.status_code == 422, response.text


def test_an_unknown_verdict_is_refused_before_the_database(as_user):
    as_user(EXPERT)
    with patch("app.common.consultations.service.repo.create_assessment", new=AsyncMock()) as create:
        response = client.post("/api/v1/consultations/c-1/assessments", json={"verdict": "maybe"})
    assert response.status_code == 422
    create.assert_not_awaited()


@pytest.mark.asyncio
async def test_any_other_database_error_is_not_swallowed():
    with (
        patch(
            "app.common.consultations.service.repo.create_assessment", new=AsyncMock(side_effect=_api_error("XX000"))
        ),
        pytest.raises(APIError),
    ):
        await service.create_assessment(EXPERT, "c-1", {"verdict": "agree"})


def test_the_assessments_list_reads_with_the_callers_token(as_user):
    as_user(FARMER)
    with patch(
        "app.common.consultations.service.repo.fetch_assessments", new=AsyncMock(return_value=[ASSESSMENT])
    ) as fetch:
        response = client.get("/api/v1/consultations/c-1/assessments")
    assert response.status_code == 200, response.text
    assert [row["id"] for row in response.json()] == ["a-1"]
    fetch.assert_awaited_once_with(FARMER.access_token, "c-1")


def test_the_assessment_routes_refuse_an_anonymous_caller():
    assert client.get("/api/v1/consultations/c-1/assessments").status_code == 401
    assert client.post("/api/v1/consultations/c-1/assessments", json={"verdict": "agree"}).status_code == 401


# --- disease_case_id on create


@pytest.mark.asyncio
async def test_someone_elses_disease_case_is_a_403():
    with (
        patch("app.expert.service.repo.fetch_expert_by_id", return_value={"id": EXPERT.id}),
        patch("app.common.consultations.service.repo.create_request", new=AsyncMock(side_effect=_api_error("42501"))),
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.create_request(FARMER, {"expert_id": EXPERT.id, "subject": "s", "disease_case_id": "case-x"})
    assert getattr(exc_info.value, "status_code", None) == 403


@pytest.mark.asyncio
async def test_a_42501_without_a_disease_case_is_not_relabelled():
    with (
        patch("app.expert.service.repo.fetch_expert_by_id", return_value={"id": EXPERT.id}),
        patch("app.common.consultations.service.repo.create_request", new=AsyncMock(side_effect=_api_error("42501"))),
        pytest.raises(APIError),
    ):
        await service.create_request(FARMER, {"expert_id": EXPERT.id, "subject": "s", "disease_case_id": None})


# --- ai_report on the consultation read


def _consultation(case_id: str | None) -> dict:
    return {"id": "c-1", "user_id": FARMER.id, "expert_id": EXPERT.id, "status": "accepted", "disease_case_id": case_id}


@pytest.mark.asyncio
async def test_no_disease_case_means_no_ai_report_and_no_ai_call():
    with (
        patch("app.common.consultations.service.repo.get_by_id", new=AsyncMock(return_value=_consultation(None))),
        patch("app.common.consultations.service.ai_service.fetch_case_report", new=AsyncMock()) as fetch,
    ):
        result = await service.fetch_by_id(EXPERT, "c-1")
    assert result["ai_report"] is None
    fetch.assert_not_awaited()


@pytest.mark.asyncio
async def test_the_ai_report_is_read_with_the_callers_token():
    case = {"id": "case-1", "image_signed_url": "https://signed", "report": REPORT}
    with (
        patch("app.common.consultations.service.repo.get_by_id", new=AsyncMock(return_value=_consultation("case-1"))),
        patch(
            "app.common.consultations.service.ai_service.fetch_case_report", new=AsyncMock(return_value=case)
        ) as fetch,
    ):
        result = await service.fetch_by_id(EXPERT, "c-1")
    fetch.assert_awaited_once_with(EXPERT.access_token, "case-1")
    assert result["ai_report"]["case_id"] == "case-1"
    assert result["ai_report"]["image_url"] == "https://signed"
    assert result["ai_report"]["report"]["class_label"] == "Tomato___Early_blight"


@pytest.mark.parametrize(
    "fetch",
    [
        AsyncMock(side_effect=StorageApiError("signing failed", "InternalError", 500)),  # photo signing fails
        AsyncMock(side_effect=_api_error("XX000")),  # the case read fails
        AsyncMock(side_effect=httpx.ConnectError("database unreachable")),
        AsyncMock(return_value=None),  # RLS hides the case from this caller
        AsyncMock(return_value={"id": "case-1", "report": None}),  # no prediction yet
        AsyncMock(return_value={"id": "case-1", "report": {"class_label": "only"}}),  # malformed report
    ],
    ids=["storage-fails", "database-fails", "network-fails", "case-hidden", "no-prediction", "malformed-report"],
)
@pytest.mark.asyncio
async def test_any_ai_side_failure_gives_no_report_and_still_returns_the_consultation(fetch):
    with (
        patch("app.common.consultations.service.repo.get_by_id", new=AsyncMock(return_value=_consultation("case-1"))),
        patch("app.common.consultations.service.ai_service.fetch_case_report", new=fetch),
    ):
        result = await service.fetch_by_id(EXPERT, "c-1")
    assert result["id"] == "c-1"
    assert result["ai_report"] is None


def test_the_detail_route_returns_200_with_a_null_report_when_the_ai_fails(as_user):
    as_user(EXPERT)
    with (
        patch(
            "app.common.consultations.service.repo.get_by_id",
            new=AsyncMock(
                return_value={
                    **_consultation("case-1"),
                    "subject": "s",
                    "crop_id": None,
                    "problem_description": None,
                    "farm_id": None,
                    "images": [],
                    "priority": "medium",
                    "created_at": "2026-10-11T09:00:00+00:00",
                    "updated_at": "2026-10-11T09:00:00+00:00",
                }
            ),
        ),
        patch(
            "app.common.consultations.service.ai_service.fetch_case_report",
            new=AsyncMock(side_effect=StorageApiError("signing failed", "InternalError", 500)),
        ),
    ):
        response = client.get("/api/v1/consultations/c-1")
    assert response.status_code == 200, response.text
    assert response.json()["ai_report"] is None
