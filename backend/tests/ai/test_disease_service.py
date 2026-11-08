"""
Tests for the disease-case ownership fix (backend/app/ai/service.py) — the
recon's flagged vulnerability was that ANY disease_case_id could be predicted against
regardless of caller. These tests verify a non-owner/non-admin is rejected, an owner/admin is
allowed, and the model-unavailable/invalid-image error paths return the right status codes.
Repository and classifier calls are mocked; only the AI service's own logic is under test.

Security fix C2 (SSRF) changed how the case image reaches predict(): it now comes from
disease_repository.download_case_image() (the Storage API) instead of an httpx GET against a
client-supplied URL, and every response now carries a signed image_signed_url instead of the
raw storage_path — see test_disease_case_ssrf_protection.py for the SSRF-specific regression
tests (payload rejection, cross-user paths). This file stays focused on ownership + the
predict()/get_case_for_user() control flow.
"""

import asyncio
import json
import time
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException
from PIL import UnidentifiedImageError
from storage3.exceptions import StorageApiError

from app.ai import service as disease_service
from app.ai.engine import ModelUnavailableError
from app.ai.service import DEFAULT_DESCRIPTION, DESCRIPTIONS, _humanize_class_name, supported_crops
from app.auth.dependencies import AuthenticatedUser
from app.config.settings import settings

OWNER = AuthenticatedUser(id="owner-1", email="owner@x.com", role="farmer", access_token="t")
STRANGER = AuthenticatedUser(id="stranger-1", email="stranger@x.com", role="farmer", access_token="t")
ADMIN = AuthenticatedUser(id="admin-1", email="admin@x.com", role="admin", access_token="t")

CASE = {"id": "case-1", "user_id": OWNER.id, "crop_id": None, "storage_path": f"{OWNER.id}/img.jpg"}


def _mock_image_download(content: bytes = b"fake-bytes"):
    return patch("app.ai.service.disease_repository.download_case_image", return_value=content)


def _mock_signed_url(url: str = "https://example.supabase.co/storage/signed?token=abc"):
    return patch("app.ai.service.disease_repository.create_signed_url", return_value=url)


@contextmanager
def _mock_classifier(return_value: tuple[str, float] | None = None, side_effect: Exception | None = None):
    """P5 (item 3): predict() now resolves the classifier via `get_classifier()` on each call
    instead of importing a module-level `classifier` name, so the target to patch is the getter,
    not an attribute on disease_service itself. Yields the mock `.predict` method directly, so
    call sites that need `mock_predict.assert_not_called()` still work unchanged."""
    mock_classifier = MagicMock()
    if side_effect is not None:
        mock_classifier.predict.side_effect = side_effect
    else:
        mock_classifier.predict.return_value = return_value
    with patch("app.ai.service.get_classifier", return_value=mock_classifier):
        yield mock_classifier.predict


@pytest.mark.asyncio
async def test_predict_rejects_stranger_with_404():
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(STRANGER, CASE["id"])
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_predict_rejects_nonexistent_case_with_404():
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=None),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, "does-not-exist")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_predict_allows_owner_and_returns_inserted_prediction():
    inserted = {"id": "pred-1", "disease_case_id": CASE["id"], "predicted_disease": "healthy", "confidence_score": 0.9}
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        _mock_image_download(),
        _mock_classifier(return_value=("healthy", 0.9)),
        patch("app.ai.service.disease_repository.insert_prediction", return_value=inserted) as mock_insert,
    ):
        result = await disease_service.predict(OWNER, CASE["id"])

    assert {k: result[k] for k in inserted} == inserted
    assert result["crop_matches"] is None  # no crop was chosen, so there is nothing to match
    mock_insert.assert_called_once()


@pytest.mark.asyncio
async def test_predict_allows_admin_for_someone_elses_case():
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        _mock_image_download(),
        _mock_classifier(return_value=("healthy", 0.9)),
        patch("app.ai.service.disease_repository.insert_prediction", return_value={"id": "p"}),
    ):
        # ADMIN.id != CASE["user_id"], must still succeed
        await disease_service.predict(ADMIN, CASE["id"])


@pytest.mark.asyncio
async def test_predict_model_unavailable_returns_503():
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        _mock_image_download(),
        _mock_classifier(side_effect=ModelUnavailableError("no weights")),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_predict_invalid_image_returns_422():
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        _mock_image_download(),
        _mock_classifier(side_effect=UnidentifiedImageError("not an image")),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "download_error",
    [
        StorageApiError("The resource was not found", "not_found", 404),  # storage API error response
        httpx.ConnectError("connection refused"),  # network-level failure before storage3 responds
    ],
)
async def test_predict_storage_download_failure_returns_422_not_the_underlying_error(download_error):
    # Security fix C2: any failure fetching the image from storage (object missing, transient
    # storage error, ...) must map to the same generic 422 as an invalid image — never leak
    # which case it was, matching the "uniform errors" requirement that closed the SSRF finding.
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        patch(
            "app.ai.service.disease_repository.download_case_image",
            side_effect=download_error,
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail == "Could not process the case image."


@pytest.mark.asyncio
async def test_predict_oversized_image_returns_422_before_decoding():
    oversized = b"x" * (8 * 1024 * 1024 + 1)
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        _mock_image_download(oversized),
        _mock_classifier() as mock_predict,
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 422
    mock_predict.assert_not_called()  # rejected on size before ever reaching the model


@pytest.mark.asyncio
async def test_get_case_for_user_rejects_stranger_with_404():
    case_with_relations = {**CASE, "crop": None, "prediction": []}
    with (
        patch(
            "app.ai.service.disease_repository.get_case_with_prediction",
            return_value=case_with_relations,
        ),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.get_case_for_user(STRANGER, CASE["id"])
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_get_case_for_user_allows_owner_and_unwraps_prediction_list():
    case_with_relations = {**CASE, "crop": None, "prediction": [{"id": "pred-1"}]}
    with (
        patch(
            "app.ai.service.disease_repository.get_case_with_prediction",
            return_value=case_with_relations,
        ),
        _mock_signed_url("https://example.supabase.co/storage/signed?token=abc"),
    ):
        result = await disease_service.get_case_for_user(OWNER, CASE["id"])
    assert result["prediction"] == {"id": "pred-1"}
    # storage_path never reaches the response — only a signed, displayable URL does.
    assert "storage_path" not in result
    assert result["image_signed_url"] == "https://example.supabase.co/storage/signed?token=abc"


@pytest.mark.asyncio
async def test_get_case_for_user_raises_500_if_signing_fails():
    # The object the row points at is gone, or the signing call itself failed — a server-side
    # fault distinct from the client ever having sent bad input, so this is a 500.
    case_with_relations = {**CASE, "crop": None, "prediction": []}
    with (
        patch(
            "app.ai.service.disease_repository.get_case_with_prediction",
            return_value=case_with_relations,
        ),
        _mock_signed_url(None),
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.get_case_for_user(OWNER, CASE["id"])
    assert exc_info.value.status_code == 500


class TestCreateCase:
    @pytest.mark.asyncio
    async def test_rejects_a_storage_path_under_someone_elses_id(self):
        # Security fix C2: the schema's regex can validate shape, not identity — this is the
        # server-side ownership check that stops one user creating a case pointing at another
        # user's uploaded object.
        with pytest.raises(HTTPException) as exc_info:
            await disease_service.create_case(OWNER, None, f"{STRANGER.id}/photo.jpg")
        assert exc_info.value.status_code == 422

    @pytest.mark.asyncio
    async def test_accepts_a_storage_path_under_the_callers_own_id(self):
        created = {"id": "case-1", "user_id": OWNER.id, "crop_id": None, "storage_path": f"{OWNER.id}/photo.jpg"}
        with (
            patch("app.ai.service.disease_repository.create_case", return_value=created),
            _mock_signed_url(),
        ):
            result = await disease_service.create_case(OWNER, None, f"{OWNER.id}/photo.jpg")
        assert result["id"] == "case-1"
        assert "storage_path" not in result


# --- _humanize_class_name: real PlantVillage taxonomy strings, chosen to cover the tricky
# formatting cases (trailing underscore, comma in crop name, parenthetical, multi-word disease
# joined by a bare space, and the "___healthy" suffix) rather than a synthetic example ---
@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Tomato___Late_blight", "Tomato — Late blight"),
        ("Tomato___healthy", "Tomato — Healthy"),
        ("Corn_(maize)___Common_rust_", "Corn (maize) — Common rust"),
        ("Pepper,_bell___Bacterial_spot", "Pepper, bell — Bacterial spot"),
        ("Grape___Esca_(Black_Measles)", "Grape — Esca (Black Measles)"),
        (
            "Tomato___Spider_mites Two-spotted_spider_mite",
            "Tomato — Spider mites Two-spotted spider mite",
        ),
    ],
)
def test_humanize_class_name(raw, expected):
    assert _humanize_class_name(raw) == expected


def test_descriptions_covers_every_configured_model_class():
    # Regression guard: every class the real model can actually predict (settings.model_classes,
    # loaded from model_metadata.json) must have a real DESCRIPTIONS entry — a class missing here
    # would silently fall back to DEFAULT_DESCRIPTION for every prediction of that type.
    missing = [c for c in settings.model_classes if c not in DESCRIPTIONS]
    assert missing == [], f"model_classes entries with no DESCRIPTIONS copy: {missing}"


def test_descriptions_entries_are_never_empty():
    # Every entry must be real, non-empty advisory copy — never the old (None, []) shape.
    for raw_class, (description, actions) in DESCRIPTIONS.items():
        assert description, f"{raw_class!r} has an empty description"
        assert actions, f"{raw_class!r} has no recommended actions"


def test_unknown_class_falls_back_to_default_description_not_none():
    # Direct regression guard for the exact bug this pass fixed: DESCRIPTIONS.get(unknown, ...)
    # must never resolve to (None, []) — a bare label with no advisory copy at all.
    description, actions = DESCRIPTIONS.get("Some_Future_Class___Not_Yet_Documented", DEFAULT_DESCRIPTION)
    assert description is not None
    assert description == DEFAULT_DESCRIPTION[0]
    assert actions == DEFAULT_DESCRIPTION[1]
    assert len(actions) > 0


@pytest.mark.asyncio
async def test_predict_stores_humanized_label_and_looks_up_description_by_raw_label():
    # End-to-end (within this mocked test) check that predict() humanizes the STORED label but
    # looks up DESCRIPTIONS by the RAW label the classifier actually returned — getting this
    # order backwards would make every real prediction miss its DESCRIPTIONS entry.
    captured = {}

    def fake_insert_prediction(**kwargs):
        captured.update(kwargs)
        return {"id": "pred-1", **kwargs}

    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        _mock_image_download(),
        _mock_classifier(return_value=("Tomato___Late_blight", 0.87)),
        patch(
            "app.ai.service.disease_repository.insert_prediction",
            side_effect=fake_insert_prediction,
        ),
    ):
        await disease_service.predict(OWNER, CASE["id"])

    assert captured["predicted_disease"] == "Tomato — Late blight"
    assert captured["description"] == DESCRIPTIONS["Tomato___Late_blight"][0]
    assert captured["recommended_actions"] == DESCRIPTIONS["Tomato___Late_blight"][1]


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
        return "healthy", 0.9

    slow_classifier = MagicMock()
    slow_classifier.predict.side_effect = slow_predict
    watcher = asyncio.create_task(ticker())
    try:
        with (
            patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
            _mock_image_download(),
            patch("app.ai.service.get_classifier", return_value=slow_classifier),
            patch("app.ai.service.disease_repository.insert_prediction", return_value={"id": "p"}),
        ):
            await disease_service.predict(OWNER, CASE["id"])
    finally:
        watcher.cancel()
    assert ticks >= 10, f"the event loop was blocked during inference (only {ticks} ticks in 0.4 s)"


# --- D16: the scan offers only the crops the model knows; a photo of another crop gets no report ---
_EXPECTED_CROPS = [
    "Apple", "Bell pepper", "Blueberry", "Cherry", "Grape", "Maize", "Orange", "Peach",
    "Potato", "Raspberry", "Soybean", "Squash", "Strawberry", "Tomato",
]  # fmt: skip


def test_supported_crops_are_the_fourteen_crops_of_the_model():
    crops = supported_crops()
    assert [c["name"] for c in crops] == _EXPECTED_CROPS
    assert {c["key"] for c in crops} >= {"maize", "bell-pepper", "tomato"}


def test_class_names_json_and_the_model_metadata_list_the_same_classes():
    # Two files describe the model's classes; the crop offer is derived from the one the engine uses.
    checkpoint_dir = Path(__file__).resolve().parents[2] / "app" / "ai" / "checkpoints"
    names = json.loads((checkpoint_dir / "class_names.json").read_text(encoding="utf-8"))
    assert [names[str(i)] for i in range(len(names))] == settings.model_classes


async def _predict_as(raw_class: str, chosen_crop: str | None):
    with (
        patch("app.ai.service.disease_repository.get_disease_case", return_value=CASE),
        _mock_image_download(),
        _mock_classifier(return_value=(raw_class, 0.91)),
        patch(
            "app.ai.service.disease_repository.insert_prediction",
            side_effect=lambda **kwargs: {"id": "pred-1", "created_at": "now", **kwargs},
        ),
    ):
        return await disease_service.predict(OWNER, CASE["id"], chosen_crop)


@pytest.mark.asyncio
async def test_predict_reports_a_matching_crop_with_its_report_text():
    result = await _predict_as("Tomato___Late_blight", "tomato")
    assert result["crop_matches"] is True
    assert result["predicted_crop"] == {"key": "tomato", "name": "Tomato"}
    assert result["description"] == DESCRIPTIONS["Tomato___Late_blight"][0]
    assert result["recommended_actions"]


@pytest.mark.asyncio
async def test_predict_flags_a_different_crop_and_withholds_the_report_text():
    # The farmer said potato, the model reads a tomato leaf: no description or actions go back (BR-13).
    result = await _predict_as("Tomato___Late_blight", "potato")
    assert result["crop_matches"] is False
    assert result["predicted_crop"]["name"] == "Tomato"
    assert result["description"] is None
    assert result["recommended_actions"] == []


@pytest.mark.asyncio
async def test_predict_matches_the_curated_names_maize_and_bell_pepper():
    assert (await _predict_as("Corn_(maize)___healthy", "maize"))["crop_matches"] is True
    assert (await _predict_as("Pepper,_bell___healthy", "bell-pepper"))["crop_matches"] is True


@pytest.mark.asyncio
async def test_predict_rejects_a_crop_the_model_does_not_know_before_any_work():
    with (
        patch("app.ai.service.disease_repository.get_disease_case") as get_case,
        pytest.raises(HTTPException) as exc_info,
    ):
        await disease_service.predict(OWNER, CASE["id"], "wheat")
    assert exc_info.value.status_code == 422
    get_case.assert_not_called()
