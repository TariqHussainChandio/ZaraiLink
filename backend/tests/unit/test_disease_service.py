"""
Tests for the disease-case ownership fix (backend/app/services/disease_service.py) — the
recon's flagged vulnerability was that ANY disease_case_id could be predicted against
regardless of caller. These tests verify a non-owner/non-admin is rejected, an owner/admin is
allowed, and the model-unavailable/invalid-image error paths return the right status codes.
Repository and classifier calls are mocked; only disease_service's own logic is under test.
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from PIL import UnidentifiedImageError

from app.core.auth import AuthenticatedUser
from app.core.config import settings
from app.services import disease_service
from app.services.ai_engine import ModelUnavailableError
from app.services.disease_service import DEFAULT_DESCRIPTION, DESCRIPTIONS, _humanize_class_name

OWNER = AuthenticatedUser(id="owner-1", email="owner@x.com", role="farmer", access_token="t")
STRANGER = AuthenticatedUser(id="stranger-1", email="stranger@x.com", role="farmer", access_token="t")
ADMIN = AuthenticatedUser(id="admin-1", email="admin@x.com", role="admin", access_token="t")

CASE = {"id": "case-1", "user_id": OWNER.id, "crop_id": None, "image_url": "https://x/img.jpg"}


def _mock_httpx_image_fetch(content: bytes = b"fake-bytes"):
    fake_response = MagicMock()
    fake_response.content = content
    fake_response.raise_for_status.return_value = None

    mock_client = AsyncMock()
    mock_client.get.return_value = fake_response
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = False
    return patch("app.services.disease_service.httpx.AsyncClient", return_value=mock_client)


@pytest.mark.asyncio
async def test_predict_rejects_stranger_with_404():
    with patch("app.services.disease_service.disease_repository.get_disease_case", return_value=CASE):
        with pytest.raises(HTTPException) as exc_info:
            await disease_service.predict(STRANGER, CASE["id"])
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_predict_rejects_nonexistent_case_with_404():
    with patch("app.services.disease_service.disease_repository.get_disease_case", return_value=None):
        with pytest.raises(HTTPException) as exc_info:
            await disease_service.predict(OWNER, "does-not-exist")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_predict_allows_owner_and_returns_inserted_prediction():
    inserted = {"id": "pred-1", "disease_case_id": CASE["id"], "predicted_disease": "healthy", "confidence_score": 0.9}
    with patch("app.services.disease_service.disease_repository.get_disease_case", return_value=CASE):
        with _mock_httpx_image_fetch():
            with patch("app.services.disease_service.classifier.predict", return_value=("healthy", 0.9)):
                with patch(
                    "app.services.disease_service.disease_repository.insert_prediction", return_value=inserted
                ) as mock_insert:
                    result = await disease_service.predict(OWNER, CASE["id"])

    assert result == inserted
    mock_insert.assert_called_once()


@pytest.mark.asyncio
async def test_predict_allows_admin_for_someone_elses_case():
    with patch("app.services.disease_service.disease_repository.get_disease_case", return_value=CASE):
        with _mock_httpx_image_fetch():
            with patch("app.services.disease_service.classifier.predict", return_value=("healthy", 0.9)):
                with patch(
                    "app.services.disease_service.disease_repository.insert_prediction", return_value={"id": "p"}
                ):
                    # ADMIN.id != CASE["user_id"], must still succeed
                    await disease_service.predict(ADMIN, CASE["id"])


@pytest.mark.asyncio
async def test_predict_model_unavailable_returns_503():
    with patch("app.services.disease_service.disease_repository.get_disease_case", return_value=CASE):
        with _mock_httpx_image_fetch():
            with patch(
                "app.services.disease_service.classifier.predict", side_effect=ModelUnavailableError("no weights")
            ):
                with pytest.raises(HTTPException) as exc_info:
                    await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 503


@pytest.mark.asyncio
async def test_predict_invalid_image_returns_422():
    with patch("app.services.disease_service.disease_repository.get_disease_case", return_value=CASE):
        with _mock_httpx_image_fetch():
            with patch(
                "app.services.disease_service.classifier.predict",
                side_effect=UnidentifiedImageError("not an image"),
            ):
                with pytest.raises(HTTPException) as exc_info:
                    await disease_service.predict(OWNER, CASE["id"])
    assert exc_info.value.status_code == 422


def test_get_case_for_user_rejects_stranger_with_404():
    case_with_relations = {**CASE, "crop": None, "prediction": []}
    with patch(
        "app.services.disease_service.disease_repository.get_case_with_prediction",
        return_value=case_with_relations,
    ):
        with pytest.raises(HTTPException) as exc_info:
            disease_service.get_case_for_user(STRANGER, CASE["id"])
    assert exc_info.value.status_code == 404


def test_get_case_for_user_allows_owner_and_unwraps_prediction_list():
    case_with_relations = {**CASE, "crop": None, "prediction": [{"id": "pred-1"}]}
    with patch(
        "app.services.disease_service.disease_repository.get_case_with_prediction",
        return_value=case_with_relations,
    ):
        result = disease_service.get_case_for_user(OWNER, CASE["id"])
    assert result["prediction"] == {"id": "pred-1"}


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

    with patch("app.services.disease_service.disease_repository.get_disease_case", return_value=CASE):
        with _mock_httpx_image_fetch():
            with patch(
                "app.services.disease_service.classifier.predict",
                return_value=("Tomato___Late_blight", 0.87),
            ):
                with patch(
                    "app.services.disease_service.disease_repository.insert_prediction",
                    side_effect=fake_insert_prediction,
                ):
                    await disease_service.predict(OWNER, CASE["id"])

    assert captured["predicted_disease"] == "Tomato — Late blight"
    assert captured["description"] == DESCRIPTIONS["Tomato___Late_blight"][0]
    assert captured["recommended_actions"] == DESCRIPTIONS["Tomato___Late_blight"][1]
