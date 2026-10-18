"""A6: the admin's AI activity counts and the disease knowledge base (SRDS §37, §51; BR-15).

Unit level: the repository is patched, so these prove the aggregation and the review-state rules. A knowledge write is
audited by the table's trigger (audit_disease_knowledge, 20261022080000) in the same transaction, so the service must
not write a second audit row: these assert log_admin_action is never called. The real audit rows are proven in
supabase/tests/database/20261022080000_ai_advisory.test.sql and tests/integration/smoke/test_smoke_admin_audit.py."""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.admin import service
from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.main import app

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok", aal="aal2")
ADMIN_AAL1 = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok", aal="aal1")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2")

ENTRY = {
    "class_label": "Tomato___Early_blight",
    "crop": "Tomato",
    "disease": "Early blight",
    "is_healthy": False,
    "symptoms": ["Brown rings"],
    "treatment": ["Copper spray"],
    "precautions": ["Rotate crops"],
    "advisory": "Remove affected leaves.",
    "review_status": "reviewed",
    "reviewed_by": "admin-0",
    "reviewed_at": "2026-10-01T00:00:00+00:00",
    "updated_at": "2026-10-01T00:00:00+00:00",
}


@pytest.fixture
def as_user():
    def _set(user: AuthenticatedUser) -> None:
        app.dependency_overrides[get_current_user] = lambda: user

    yield _set
    app.dependency_overrides.pop(get_current_user, None)


def _now(offset_days: int = 0, hours: int = 0) -> str:
    return (datetime.now(UTC) - timedelta(days=offset_days, hours=hours)).isoformat()


# --- AI activity


@pytest.mark.asyncio
async def test_ai_activity_counts_scans_failures_low_confidence_and_referrals():
    today = datetime.now(UTC).date().isoformat()
    cases = [
        {"created_at": _now(), "status": "predicted", "disease_predictions": [{"confidence_score": 0.95}]},
        # The best of several predictions decides: 0.4 and 0.7 is not low confidence.
        {
            "created_at": _now(),
            "status": "predicted",
            "disease_predictions": [{"confidence_score": 0.4}, {"confidence_score": 0.7}],
        },
        {"created_at": _now(), "status": "predicted", "disease_predictions": [{"confidence_score": 0.3}]},
        {"created_at": _now(), "status": "failed", "disease_predictions": []},
        {"created_at": _now(), "status": "pending", "disease_predictions": []},  # a scan, neither predicted nor failed
        {"created_at": _now(offset_days=3), "status": "predicted", "disease_predictions": [{"confidence_score": 0.5}]},
        # Outside the 30-day window: not counted even if the repository returned it.
        {"created_at": _now(offset_days=45), "status": "failed", "disease_predictions": []},
    ]
    referrals = [{"created_at": _now()}, {"created_at": _now(offset_days=3)}, {"created_at": _now(offset_days=60)}]
    with (
        patch("app.admin.service.repo.fetch_disease_cases_since", new=AsyncMock(return_value=cases)) as fetch_cases,
        patch("app.admin.service.repo.fetch_ai_referrals_since", new=AsyncMock(return_value=referrals)),
    ):
        result = await service.fetch_ai_activity(ADMIN)

    fetch_cases.assert_awaited_once()
    assert fetch_cases.await_args.args[0] == ADMIN.access_token
    assert result["window_days"] == 30
    assert len(result["days"]) == 30
    assert result["days"][-1]["date"] == today
    assert result["scans"] == 6
    assert result["failed"] == 1
    assert result["predicted"] == 4
    assert result["low_confidence"] == 2  # 0.3 today, 0.5 three days ago
    assert result["low_confidence_share"] == 0.5
    assert result["referrals"] == 2
    assert result["days"][-1] == {"date": today, "scans": 5, "failed": 1, "low_confidence": 1, "referrals": 1}
    assert sum(day["scans"] for day in result["days"]) == result["scans"]


@pytest.mark.asyncio
async def test_ai_activity_with_nothing_predicted_has_a_zero_share():
    with (
        patch("app.admin.service.repo.fetch_disease_cases_since", new=AsyncMock(return_value=[])),
        patch("app.admin.service.repo.fetch_ai_referrals_since", new=AsyncMock(return_value=[])),
    ):
        result = await service.fetch_ai_activity(ADMIN)
    assert result["scans"] == result["predicted"] == result["referrals"] == 0
    assert result["low_confidence_share"] == 0.0


def test_ai_activity_route_is_admin_only(as_user):
    as_user(FARMER)
    assert client.get("/api/v1/admin/ai-activity").status_code == 403
    as_user(ADMIN_AAL1)  # a read: the role is enough, no second factor needed
    with (
        patch("app.admin.service.repo.fetch_disease_cases_since", new=AsyncMock(return_value=[])),
        patch("app.admin.service.repo.fetch_ai_referrals_since", new=AsyncMock(return_value=[])),
    ):
        response = client.get("/api/v1/admin/ai-activity")
    assert response.status_code == 200, response.text
    assert response.json()["window_days"] == 30


# --- disease knowledge: reads


def test_the_knowledge_list_and_entry_are_admin_reads(as_user):
    as_user(FARMER)
    assert client.get("/api/v1/admin/disease-knowledge").status_code == 403
    as_user(ADMIN_AAL1)
    with patch("app.admin.service.repo.fetch_disease_knowledge", new=AsyncMock(return_value=[ENTRY])):
        listed = client.get("/api/v1/admin/disease-knowledge")
    assert listed.status_code == 200, listed.text
    assert listed.json()[0]["class_label"] == ENTRY["class_label"]
    with patch("app.admin.service.repo.fetch_disease_knowledge_entry", new=AsyncMock(return_value=None)):
        missing = client.get("/api/v1/admin/disease-knowledge/Nope")
    assert missing.status_code == 404


# --- disease knowledge: writes


@pytest.mark.asyncio
async def test_editing_a_reviewed_entry_sends_it_back_to_review_and_leaves_the_audit_to_the_trigger():
    updated = {
        **ENTRY,
        "advisory": "New text",
        "review_status": "pending_review",
        "reviewed_by": None,
        "reviewed_at": None,
    }
    with (
        patch("app.admin.service.repo.fetch_disease_knowledge_entry", new=AsyncMock(return_value=ENTRY)),
        patch("app.admin.service.repo.update_disease_knowledge", new=AsyncMock(return_value=updated)) as update,
        patch("app.admin.service.log_admin_action", new=AsyncMock(), create=True) as audit,
    ):
        result = await service.update_disease_knowledge(ADMIN, ENTRY["class_label"], {"advisory": "New text"})

    update.assert_awaited_once_with(
        ADMIN.access_token,
        ENTRY["class_label"],
        {"advisory": "New text", "review_status": "pending_review", "reviewed_by": None, "reviewed_at": None},
    )
    assert result["review_status"] == "pending_review"
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_editing_a_pending_entry_changes_only_the_text():
    pending = {**ENTRY, "review_status": "pending_review", "reviewed_by": None, "reviewed_at": None}
    with (
        patch("app.admin.service.repo.fetch_disease_knowledge_entry", new=AsyncMock(return_value=pending)),
        patch("app.admin.service.repo.update_disease_knowledge", new=AsyncMock(return_value=pending)) as update,
        patch("app.admin.service.log_admin_action", new=AsyncMock(), create=True) as audit,
    ):
        await service.update_disease_knowledge(ADMIN, ENTRY["class_label"], {"symptoms": ["Yellow spots"]})
    assert update.await_args.args[2] == {"symptoms": ["Yellow spots"]}
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_empty_edit_is_refused_and_nothing_is_written_or_audited():
    with (
        patch("app.admin.service.repo.update_disease_knowledge", new=AsyncMock()) as update,
        patch("app.admin.service.log_admin_action", new=AsyncMock(), create=True) as audit,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.update_disease_knowledge(ADMIN, ENTRY["class_label"], {})
    assert getattr(exc_info.value, "status_code", None) == 422
    update.assert_not_awaited()
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_editing_a_missing_class_is_a_404_with_no_audit():
    with (
        patch("app.admin.service.repo.fetch_disease_knowledge_entry", new=AsyncMock(return_value=None)),
        patch("app.admin.service.log_admin_action", new=AsyncMock(), create=True) as audit,
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.update_disease_knowledge(ADMIN, "Nope", {"advisory": "x"})
    assert getattr(exc_info.value, "status_code", None) == 404
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_reviewing_records_this_admin_as_reviewer_and_leaves_the_audit_to_the_trigger():
    pending = {**ENTRY, "review_status": "pending_review", "reviewed_by": None, "reviewed_at": None}
    reviewed = {**ENTRY, "reviewed_by": ADMIN.id}
    with (
        patch("app.admin.service.repo.fetch_disease_knowledge_entry", new=AsyncMock(return_value=pending)),
        patch("app.admin.service.repo.update_disease_knowledge", new=AsyncMock(return_value=reviewed)) as update,
        patch("app.admin.service.log_admin_action", new=AsyncMock(), create=True) as audit,
    ):
        await service.review_disease_knowledge(ADMIN, ENTRY["class_label"])

    fields = update.await_args.args[2]
    assert fields["review_status"] == "reviewed"
    assert fields["reviewed_by"] == ADMIN.id
    assert datetime.fromisoformat(fields["reviewed_at"]) <= datetime.now(UTC)
    audit.assert_not_awaited()


def test_knowledge_writes_need_a_second_factor(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.admin.service.repo.update_disease_knowledge", new=AsyncMock()) as update:
        patched = client.patch("/api/v1/admin/disease-knowledge/X", json={"advisory": "x"})
        reviewed = client.post("/api/v1/admin/disease-knowledge/X/review")
    assert patched.status_code == 403
    assert patched.json()["code"] == "mfa_required"
    assert reviewed.status_code == 403
    update.assert_not_awaited()


def test_a_blank_advisory_or_a_blank_line_is_a_422(as_user):
    as_user(ADMIN)
    with patch("app.admin.service.repo.update_disease_knowledge", new=AsyncMock()) as update:
        blank = client.patch("/api/v1/admin/disease-knowledge/X", json={"advisory": "   "})
        blank_line = client.patch("/api/v1/admin/disease-knowledge/X", json={"symptoms": ["ok", " "]})
    assert blank.status_code == 422
    assert blank_line.status_code == 422
    update.assert_not_awaited()


def test_the_patch_route_passes_only_the_fields_sent(as_user):
    as_user(ADMIN)
    with patch("app.admin.router.service.update_disease_knowledge", new=AsyncMock(return_value=ENTRY)) as update:
        response = client.patch("/api/v1/admin/disease-knowledge/X", json={"crop": "Tomato"})
    assert response.status_code == 200, response.text
    update.assert_awaited_once_with(ADMIN, "X", {"crop": "Tomato"})
