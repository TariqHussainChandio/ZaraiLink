"""
Unit tests for the AI advisory service (backend/app/ai/service.py), plan A6.

Covers the control flow the real-stack smoke test (tests/integration/smoke/test_smoke_ai_advisory.py) cannot reach
cheaply: the ownership check before inference, every failure path recording `status = 'failed'` with a short reason,
the report assembled from a `disease_knowledge` row (or the fallback when a class has none), the confidence band, the
disclaimer on every report (BR-13), and the read path that lets row-level security decide who sees a case.
Repository and classifier calls are patched; only the AI service's own logic is under test here.

Security fix C2 (SSRF): the image comes from disease_repository.download_case_image() (the Storage API), never a
client-supplied URL, and every response carries a signed `image_signed_url`, never the stored path; see
test_disease_case_ssrf_protection.py for the payload tests.
"""

import asyncio
import re
import time
from contextlib import ExitStack, contextmanager
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from PIL import UnidentifiedImageError
from storage3.exceptions import StorageApiError

from app.ai import service as disease_service
from app.ai.engine import ModelUnavailableError
from app.ai.schemas import LOW_CONFIDENCE_THRESHOLD, DiseaseCaseWithPredictionResponse, DiseaseReport
from app.auth.dependencies import AuthenticatedUser
from app.config.settings import settings

OWNER = AuthenticatedUser(id="owner-1", email="owner@x.com", role="farmer", access_token="owner-token")
STRANGER = AuthenticatedUser(id="stranger-1", email="stranger@x.com", role="farmer", access_token="t")
ADMIN = AuthenticatedUser(id="admin-1", email="admin@x.com", role="admin", access_token="t")

CASE = {"id": "case-1", "user_id": OWNER.id, "crop_id": None, "storage_path": f"{OWNER.id}/img.jpg"}
CREATED_AT = "2026-10-01T00:00:00+00:00"

LATE_BLIGHT = {
    "class_label": "Tomato___Late_blight",
    "crop": "Tomato",
    "disease": "Late blight",
    "is_healthy": False,
    "symptoms": ["Dark, water-soaked patches on leaves"],
    "treatment": ["Remove and destroy infected plants"],
    "precautions": ["Avoid overhead irrigation"],
    "advisory": "The pattern may indicate late blight. Consult an agricultural expert.",
    "review_status": "pending_review",
    "reviewed_at": None,
    "updated_at": CREATED_AT,
}
TOMATO_HEALTHY = {
    **LATE_BLIGHT,
    "class_label": "Tomato___healthy",
    "disease": "Healthy",
    "is_healthy": True,
    "symptoms": [],
    "treatment": [],
    "precautions": ["Keep inspecting weekly"],
    "advisory": "No disease was found in this photo.",
    "review_status": "reviewed",
}

MIGRATION = Path(__file__).resolve().parents[3] / "supabase" / "migrations" / "20261022080000_ai_advisory.sql"


def _repo(name: str, **kwargs):
    """Patches one async repository function; AsyncMock so an `await` in the service gets a real value."""
    return patch(f"app.ai.service.disease_repository.{name}", new_callable=AsyncMock, **kwargs)


@contextmanager
def _mock_classifier(return_value: tuple[str, float] | None = None, side_effect: Exception | None = None):
    """predict() resolves the classifier through `get_classifier()` on each call (P5, item 3), so the getter is what
    is patched. Yields the mock `.predict` so a test can assert it was never reached."""
    mock_classifier = MagicMock()
    if side_effect is not None:
        mock_classifier.predict.side_effect = side_effect
    else:
        mock_classifier.predict.return_value = return_value
    with patch("app.ai.service.get_classifier", return_value=mock_classifier):
        yield mock_classifier.predict


def _fake_insert(**kwargs):
    return {"id": "pred-1", "created_at": CREATED_AT, **kwargs}


@contextmanager
def _predict_path(case=CASE, image: bytes = b"fake-bytes", knowledge=LATE_BLIGHT):
    """The repository calls of one successful predict(); yields the mocks by name."""
    with ExitStack() as stack:
        mocks = {
            "get_disease_case": stack.enter_context(_repo("get_disease_case", return_value=case)),
            "download_case_image": stack.enter_context(_repo("download_case_image", return_value=image)),
            "get_knowledge": stack.enter_context(_repo("get_knowledge", return_value=knowledge)),
            "insert_prediction": stack.enter_context(_repo("insert_prediction", side_effect=_fake_insert)),
            "set_case_status": stack.enter_context(_repo("set_case_status")),
        }
        yield mocks


# --------------------------------------------------------------------------- predict: who may run it


@pytest.mark.asyncio
async def test_predict_rejects_stranger_with_404():
    with _predict_path() as mocks, pytest.raises(HTTPException) as exc_info:
        await disease_service.predict(STRANGER, CASE["id"])
    assert exc_info.value.status_code == 404
    mocks["download_case_image"].assert_not_called()
    mocks["set_case_status"].assert_not_called()  # someone else's case is never touched


@pytest.mark.asyncio
async def test_predict_rejects_nonexistent_case_with_404():
    with _predict_path(case=None), pytest.raises(HTTPException) as exc_info:
        await disease_service.predict(OWNER, "does-not-exist")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_predict_refuses_an_admin_on_someone_elses_case():
    # D11: prediction is the farmer's own action. An admin reads a case (GET /cases/{id}, through RLS) but never runs
    # the model on it, so the same 404 a stranger gets.
    with _predict_path() as mocks, pytest.raises(HTTPException) as exc_info:
        await disease_service.predict(ADMIN, CASE["id"])
    assert exc_info.value.status_code == 404
    mocks["insert_prediction"].assert_not_called()


# --------------------------------------------------------------------------- predict: the report


@pytest.mark.asyncio
async def test_predict_stores_the_knowledge_text_and_returns_the_report():
    with _predict_path() as mocks, _mock_classifier(return_value=("Tomato___Late_blight", 0.87)):
        result = await disease_service.predict(OWNER, CASE["id"])

    mocks["get_knowledge"].assert_awaited_once_with("Tomato___Late_blight")  # looked up by the raw label
    stored = mocks["insert_prediction"].call_args.kwargs
    assert stored["predicted_disease"] == "Tomato — Late blight"
    assert stored["description"] == LATE_BLIGHT["advisory"]
    assert stored["recommended_actions"] == LATE_BLIGHT["treatment"]
    assert stored["model_version"] == settings.model_version
    mocks["set_case_status"].assert_awaited_once_with(CASE["id"], "predicted", None)

    report = DiseaseReport.model_validate(result["report"])  # the published contract, not a loose dict
    assert report.class_label == "Tomato___Late_blight"
    assert report.crop == "Tomato"
    assert report.disease == "Late blight"
    assert report.symptoms == LATE_BLIGHT["symptoms"]
    assert report.precautions == LATE_BLIGHT["precautions"]
    assert report.confidence_band == "confident"
    assert report.is_healthy is False
    assert report.review_status == "pending_review"
    # BR-13 plus plan A6: unreviewed text says so, on top of the advisory disclaimer every report carries.
    assert report.disclaimer.startswith("This is an AI suggestion, not a diagnosis.")
    assert "not yet been reviewed" in report.disclaimer


@pytest.mark.asyncio
async def test_a_reviewed_healthy_result_has_the_plain_disclaimer():
    with _predict_path(knowledge=TOMATO_HEALTHY), _mock_classifier(return_value=("Tomato___healthy", 0.95)):
        result = await disease_service.predict(OWNER, CASE["id"])
    report = result["report"]
    assert report["is_healthy"] is True
    assert report["review_status"] == "reviewed"
    assert report["disclaimer"].startswith("This is an AI suggestion")
    assert "not yet been reviewed" not in report["disclaimer"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("confidence", "band"),
    [(LOW_CONFIDENCE_THRESHOLD - 0.01, "low"), (LOW_CONFIDENCE_THRESHOLD, "confident"), (0.99, "confident")],
)
async def test_the_confidence_band_edge_is_the_plan_threshold(confidence, band):
    with _predict_path(), _mock_classifier(return_value=("Tomato___Late_blight", confidence)):
        result = await disease_service.predict(OWNER, CASE["id"])
    assert result["report"]["confidence_band"] == band


@pytest.mark.asyncio
async def test_a_class_with_no_knowledge_row_still_gets_a_real_unreviewed_advisory():
    # The migration seeds all 38 classes; this is the drift case (class_names.json gained a class the table lacks).
    with _predict_path(knowledge=None) as mocks, _mock_classifier(return_value=("Corn_(maize)___Common_rust_", 0.8)):
        result = await disease_service.predict(OWNER, CASE["id"])
    stored = mocks["insert_prediction"].call_args.kwargs
    assert stored["predicted_disease"] == "Corn (maize) — Common rust"
    assert "expert" in stored["description"]
    report = result["report"]
    assert report["class_label"] == "Corn_(maize)___Common_rust_"
    assert report["crop"] == "Corn (maize)"
    assert report["disease"] == "Common rust"
    assert report["review_status"] == "pending_review"
    assert report["advisory"] == stored["description"]
    assert "not yet been reviewed" in report["disclaimer"]


# --------------------------------------------------------------------------- predict: failures are recorded


@pytest.mark.asyncio
async def test_model_unavailable_is_a_503_and_marks_the_case_failed():
    with (
        _predict_path() as mocks,
        _mock_classifier(side_effect=ModelUnavailableError("no weights")),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 503
    assert "temporarily unavailable" in exc_info.value.detail
    mocks["set_case_status"].assert_awaited_once_with(CASE["id"], "failed", "model_unavailable")
    mocks["insert_prediction"].assert_not_called()


@pytest.mark.asyncio
async def test_an_invalid_image_is_a_422_and_marks_the_case_failed():
    with (
        _predict_path() as mocks,
        _mock_classifier(side_effect=UnidentifiedImageError("not an image")),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 422
    mocks["set_case_status"].assert_awaited_once_with(CASE["id"], "failed", "image_unprocessable")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "download_error",
    [
        StorageApiError("The resource was not found", "not_found", 404),  # storage API error response
        httpx.ConnectError("connection refused"),  # network-level failure before storage3 responds
    ],
)
async def test_a_storage_failure_is_the_generic_422(download_error):
    # Security fix C2: every failure fetching the image maps to one message, so a response never tells "missing" from
    # "broken" (the uniform-errors requirement that closed the SSRF finding).
    with (
        _predict_path() as mocks,
        patch(
            "app.ai.service.disease_repository.download_case_image", new_callable=AsyncMock, side_effect=download_error
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Could not process the case image."
    mocks["set_case_status"].assert_awaited_once_with(CASE["id"], "failed", "image_unprocessable")


@pytest.mark.asyncio
async def test_an_oversized_image_is_refused_before_decoding():
    oversized = b"x" * (8 * 1024 * 1024 + 1)
    with (
        _predict_path(image=oversized) as mocks,
        _mock_classifier() as mock_predict,
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 422
    mock_predict.assert_not_called()  # rejected on size before ever reaching the model
    mocks["set_case_status"].assert_awaited_once_with(CASE["id"], "failed", "image_unprocessable")


# --------------------------------------------------------------------------- reading a case: RLS decides


def _case_row(predictions: list[dict]) -> dict:
    return {**CASE, "crop": None, "status": "predicted", "failure_reason": None, "prediction": predictions}


def _prediction(pid: str, created_at: str, name: str = "Tomato — Late blight", confidence: float = 0.9) -> dict:
    return {
        "id": pid,
        "disease_case_id": CASE["id"],
        "predicted_disease": name,
        "confidence_score": confidence,
        "description": "stored text",
        "recommended_actions": [],
        "model_version": "v1",
        "created_at": created_at,
    }


@pytest.mark.asyncio
async def test_a_case_rls_hides_is_a_404():
    # The read runs with the caller's own token; a case RLS does not return is the same 404 as a missing id.
    with _repo("get_case_with_prediction_as_user", return_value=None) as read, pytest.raises(HTTPException) as exc:
        await disease_service.get_case_for_user(STRANGER, CASE["id"])
    assert exc.value.status_code == 404
    read.assert_awaited_once_with(STRANGER.access_token, CASE["id"])


@pytest.mark.asyncio
async def test_a_case_returns_its_latest_prediction_with_the_live_report():
    row = _case_row([_prediction("old", "2026-09-01T00:00:00+00:00"), _prediction("new", "2026-10-01T00:00:00+00:00")])
    with (
        _repo("get_case_with_prediction_as_user", return_value=row) as read,
        _repo("list_knowledge_as_user", return_value=[LATE_BLIGHT, TOMATO_HEALTHY]) as knowledge,
        _repo("create_signed_url", return_value="https://example.supabase.co/signed?token=abc"),
    ):
        result = await disease_service.get_case_for_user(OWNER, CASE["id"])
    read.assert_awaited_once_with(OWNER.access_token, CASE["id"])
    knowledge.assert_awaited_once_with(OWNER.access_token)
    assert result["prediction"]["id"] == "new"
    assert "storage_path" not in result  # the private path never leaves the service
    assert result["image_signed_url"] == "https://example.supabase.co/signed?token=abc"
    report = DiseaseReport.model_validate(result["report"])
    assert report.class_label == "Tomato___Late_blight"
    assert report.treatment == LATE_BLIGHT["treatment"]  # the live knowledge row, not the stored copy


@pytest.mark.asyncio
async def test_a_pre_a6_prediction_name_still_finds_its_knowledge_row():
    # Rows written before A6 stored a mechanically derived name; the match key ignores punctuation and case.
    legacy = _prediction("p", CREATED_AT, name="Tomato — Late blight ")
    with (
        _repo("get_case_with_prediction_as_user", return_value=_case_row([legacy])),
        _repo("list_knowledge_as_user", return_value=[LATE_BLIGHT]),
        _repo("create_signed_url", return_value="https://signed"),
    ):
        result = await disease_service.get_case_for_user(OWNER, CASE["id"])
    assert result["report"]["review_status"] == "pending_review"
    assert result["report"]["symptoms"] == LATE_BLIGHT["symptoms"]


@pytest.mark.asyncio
async def test_a_failed_case_has_no_report():
    row = {**_case_row([]), "status": "failed", "failure_reason": "model_unavailable"}
    with (
        _repo("get_case_with_prediction_as_user", return_value=row),
        _repo("list_knowledge_as_user") as knowledge,
        _repo("create_signed_url", return_value="https://signed"),
    ):
        result = await disease_service.get_case_for_user(OWNER, CASE["id"])
    assert result["prediction"] is None
    assert result["report"] is None
    assert result["status"] == "failed"
    assert result["failure_reason"] == "model_unavailable"
    knowledge.assert_not_called()


@pytest.mark.asyncio
async def test_a_failed_signing_is_a_500():
    with (
        _repo("get_case_with_prediction_as_user", return_value=_case_row([])),
        _repo("create_signed_url", return_value=None),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.get_case_for_user(OWNER, CASE["id"])
    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_a_case_whose_photo_is_gone_still_loads_without_a_link():
    # A6 verification: a removed photo object used to turn the whole case into a 500. The error is the one Supabase
    # Storage really answers for a missing object; the case, its report and the expert route still load.
    missing = StorageApiError("Object not found", "not_found", "404")
    row = {**_case_row([_prediction("p", CREATED_AT)]), "created_at": CREATED_AT}
    with (
        _repo("get_case_with_prediction_as_user", return_value=row),
        _repo("list_knowledge_as_user", return_value=[LATE_BLIGHT]),
        _repo("create_signed_url", side_effect=missing),
    ):
        result = await disease_service.get_case_for_user(OWNER, CASE["id"])
    assert result["image_signed_url"] is None
    assert "storage_path" not in result
    assert result["report"]["class_label"] == "Tomato___Late_blight"
    DiseaseCaseWithPredictionResponse.model_validate(result)  # the response schema admits the missing link


@pytest.mark.asyncio
async def test_any_other_storage_error_while_signing_still_surfaces():
    # Only "not found" is tolerated; a storage outage or a permission fault is a real error, not a missing photo.
    outage = StorageApiError("Internal Server Error", "InternalError", 500)
    with (
        _repo("get_case_with_prediction_as_user", return_value=_case_row([])),
        _repo("create_signed_url", side_effect=outage),
        pytest.raises(StorageApiError),
    ):
        await disease_service.get_case_for_user(OWNER, CASE["id"])


@pytest.mark.asyncio
async def test_the_photo_link_lives_ten_minutes():
    # Access is re-checked through RLS on every case fetch; a short link limits how long it outlives a revoked access.
    with (
        _repo("get_case_with_prediction_as_user", return_value=_case_row([])),
        _repo("create_signed_url", return_value="https://signed") as sign,
    ):
        await disease_service.get_case_for_user(OWNER, CASE["id"])
    sign.assert_awaited_once_with(CASE["storage_path"], expires_in=600)


# --------------------------------------------------------------------------- creating a case


class TestCreateCase:
    @pytest.mark.asyncio
    async def test_rejects_a_storage_path_under_someone_elses_id(self):
        # Security fix C2: the regex validates shape, not identity; this check stops a case pointing at another
        # user's uploaded object.
        with _repo("create_case") as create, pytest.raises(HTTPException) as exc_info:
            await disease_service.create_case(OWNER, None, f"{STRANGER.id}/photo.jpg")
        assert exc_info.value.status_code == 422
        create.assert_not_called()

    @pytest.mark.asyncio
    async def test_accepts_a_storage_path_under_the_callers_own_id(self):
        created = {"id": "case-1", "user_id": OWNER.id, "crop_id": None, "storage_path": f"{OWNER.id}/photo.jpg"}
        with _repo("create_case", return_value=created), _repo("create_signed_url", return_value="https://signed"):
            result = await disease_service.create_case(OWNER, None, f"{OWNER.id}/photo.jpg")
        assert result["id"] == "case-1"
        assert "storage_path" not in result


# --------------------------------------------------------------------------- the knowledge base covers the model


def test_every_model_class_has_a_seeded_knowledge_row():
    # Regression guard: every class the model can emit (model_metadata.json) has a disease_knowledge row in the A6
    # migration, so no real prediction falls back to the generic advisory.
    seeded = set(re.findall(r"\(\s*'([^']+___[^']+)'", MIGRATION.read_text(encoding="utf-8")))
    missing = [c for c in settings.model_classes if c not in seeded]
    assert len(settings.model_classes) == 38
    assert missing == [], f"model classes with no disease_knowledge row: {missing}"


# --------------------------------------------------------------------------- inference off the event loop


@pytest.mark.asyncio
async def test_inference_does_not_block_the_event_loop():
    """P5 (item 2): a slow forward pass runs in a worker thread, so other requests keep being served.
    The stand-in classifier sleeps 0.4 s; a ticker coroutine must get to run many times meanwhile."""
    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    def slow_predict(_image: bytes) -> tuple[str, float]:
        time.sleep(0.4)
        return "Tomato___healthy", 0.9

    slow_classifier = MagicMock()
    slow_classifier.predict.side_effect = slow_predict
    watcher = asyncio.create_task(ticker())
    try:
        with (
            _predict_path(knowledge=TOMATO_HEALTHY),
            patch("app.ai.service.get_classifier", return_value=slow_classifier),
        ):
            await disease_service.predict(OWNER, CASE["id"])
    finally:
        watcher.cancel()
    assert ticks >= 10, f"the event loop was blocked during inference (only {ticks} ticks in 0.4 s)"
