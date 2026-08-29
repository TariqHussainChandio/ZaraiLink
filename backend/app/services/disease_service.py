import httpx
from fastapi import HTTPException
from PIL import UnidentifiedImageError

from ..core.auth import AuthenticatedUser
from ..core.config import settings
from ..repositories import disease_repository
from .ai_engine import ModelUnavailableError, classifier

# Provisional per-class copy until real training data/expert review replaces it — matches the
# placeholder `model_classes` list in `core/config.py` and docs/architecture/ai-disease-advisory.md.
DESCRIPTIONS: dict[str, tuple[str | None, list[str]]] = {
    "healthy": ("No signs of disease detected.", ["Continue routine monitoring."]),
}


def _assert_owner_or_admin(user: AuthenticatedUser, case: dict | None) -> dict:
    # 404 (not 403) whether the case doesn't exist or just isn't the caller's — doesn't confirm
    # or deny that a guessed id belongs to someone else (rule: 404 = not found / intentionally hidden).
    if case is None or (case["user_id"] != user.id and user.role != "admin"):
        raise HTTPException(status_code=404, detail="Disease case not found")
    return case


def create_case(user: AuthenticatedUser, crop_id: str | None, image_url: str) -> dict:
    return disease_repository.create_case(user.id, crop_id, image_url)


def get_case_for_user(user: AuthenticatedUser, disease_case_id: str) -> dict:
    case = disease_repository.get_case_with_prediction(disease_case_id)
    _assert_owner_or_admin(user, case)
    predictions = case.get("prediction") or []
    case["prediction"] = predictions[0] if predictions else None
    return case


async def predict(user: AuthenticatedUser, disease_case_id: str) -> dict:
    case = disease_repository.get_disease_case(disease_case_id)
    _assert_owner_or_admin(user, case)

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            image_response = await client.get(case["image_url"])
            image_response.raise_for_status()
        except httpx.HTTPError:
            raise HTTPException(status_code=422, detail="Could not fetch the case image.")

    try:
        predicted_disease, confidence = classifier.predict(image_response.content)
    except ModelUnavailableError:
        raise HTTPException(
            status_code=503,
            detail="AI model not trained yet — check back once model.pth has been trained.",
        )
    except UnidentifiedImageError:
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid image.")

    description, recommended_actions = DESCRIPTIONS.get(predicted_disease, (None, []))

    return disease_repository.insert_prediction(
        disease_case_id=case["id"],
        predicted_disease=predicted_disease,
        confidence_score=confidence,
        description=description,
        recommended_actions=recommended_actions,
        model_version=settings.model_version,
    )
