import asyncio

import httpx
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from storage3.exceptions import StorageApiError
from storage3.utils import StorageException

from app.ai import repository as disease_repository
from app.ai.engine import ModelUnavailableError, get_classifier
from app.ai.schemas import LOW_CONFIDENCE_THRESHOLD
from app.auth.dependencies import AuthenticatedUser
from app.config.settings import settings

# Security fix C2: the server used to fetch whatever URL the client sent (a blind SSRF, confirmed
# in the P0 baseline). The image now always comes from our own private storage bucket, addressed
# by a path the caller must own — never a client-chosen host. Every failure in that path (object
# missing, too large, not a real image) maps to this one generic message, so a response can never
# be used to tell those cases apart from the outside.
_IMAGE_FETCH_ERROR = "Could not process the case image."
_MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB, matches the disease-images bucket's file_size_limit

# How long a signed photo link stays valid. Access to a case is re-checked through row-level security on every case
# fetch (an expert loses it the moment their consultation is rejected or closed), but a link already handed out keeps
# working until it expires. A short life limits how long a link outlives a revoked access; the app refetches the case
# when the result screen opens or regains focus, so a link that has expired is replaced (A6 verification).
_SIGNED_URL_SECONDS = 600

# BR-13: every AI result is advisory and routes to an expert, so every report carries this text, whatever the
# confidence. The second sentence is added while the knowledge text is still a draft (plan A6: every row starts
# `pending_review` until an agronomist reviews it and the admin marks it `reviewed`).
_DISCLAIMER = (
    "This is an AI suggestion, not a diagnosis. Confirm it with an agricultural expert before you treat your crop."
)
_UNREVIEWED_NOTE = " This advice has not yet been reviewed by an agricultural expert."

# Shown only when the model emits a label with no `disease_knowledge` row (the migration seeds all 38 classes, so
# this means the table and class_names.json have drifted). Still a real, advisory answer, never an empty one.
_FALLBACK_ADVISORY = (
    "Our AI has flagged a possible issue with this crop, but reviewed guidance for this condition is not available "
    "yet. Consult an agricultural expert to confirm the diagnosis and get a treatment plan."
)

# The short reasons stored in disease_cases.failure_reason: shown to the owner, so never a path or a stack trace.
_FAILURE_MODEL_UNAVAILABLE = "model_unavailable"
_FAILURE_IMAGE = "image_unprocessable"

# Lane rule: an AI outage is a clear 503 confined to this module; nothing else in the marketplace depends on it.
_MODEL_UNAVAILABLE_DETAIL = "The AI advisory is temporarily unavailable. Please try again later."


def _label(crop: str, disease: str) -> str:
    """The farmer-facing name, "Crop — Disease", built from the knowledge row rather than parsed from the raw label."""
    return f"{crop} — {disease}"


def _match_key(text: str) -> str:
    """Letters and digits only, lower case.

    A stored prediction keeps only its display name (disease_predictions has no class_label column), and rows written
    before A6 used a name derived mechanically from the raw label ("Corn (maize) — Cercospora leaf spot Gray leaf
    spot"). Reducing that old name and the raw label, or the new "Crop — Disease" name and the knowledge row's crop
    and disease, to this key finds the knowledge row either way."""
    return "".join(ch for ch in text.lower() if ch.isalnum())


def _index_knowledge(rows: list[dict]) -> dict[str, dict]:
    index: dict[str, dict] = {}
    for row in rows:
        index[_match_key(row["class_label"])] = row
        index[_match_key(row["crop"] + row["disease"])] = row
    return index


def _fallback_names(class_label: str) -> tuple[str, str]:
    # The raw model label is "<Crop>___<Disease>" (class_names.json); used only when no knowledge row exists.
    crop, _, disease = class_label.partition("___")
    return crop.replace("_", " ").strip() or class_label, disease.replace("_", " ").strip() or class_label


def build_report(prediction: dict, knowledge: dict | None, class_label: str | None = None) -> dict:
    """The AI report (schemas.DiseaseReport) for one stored prediction and its knowledge row, if any.

    Without a knowledge row the report keeps the stored description as its advisory, has empty lists, and is marked
    unreviewed, so the farmer is never shown unreviewed text as if it had been reviewed."""
    confidence = float(prediction["confidence_score"])
    if knowledge is not None:
        crop, disease = knowledge["crop"], knowledge["disease"]
        label = knowledge["class_label"]
        is_healthy = bool(knowledge["is_healthy"])
        symptoms = list(knowledge.get("symptoms") or [])
        treatment = list(knowledge.get("treatment") or [])
        precautions = list(knowledge.get("precautions") or [])
        advisory = knowledge["advisory"]
        review_status = knowledge["review_status"]
        predicted = _label(crop, disease)
    else:
        predicted = prediction["predicted_disease"]
        label = class_label or predicted
        if class_label:
            crop, disease = _fallback_names(class_label)
        else:
            crop, _, disease = predicted.partition(" — ")
            disease = disease or predicted
        is_healthy = disease.strip().lower() == "healthy"
        symptoms, treatment, precautions = [], [], []
        advisory = prediction.get("description") or _FALLBACK_ADVISORY
        review_status = "pending_review"
    disclaimer = _DISCLAIMER if review_status == "reviewed" else _DISCLAIMER + _UNREVIEWED_NOTE
    return {
        "predicted_disease": predicted,
        "class_label": label,
        "crop": crop,
        "disease": disease,
        "confidence_score": confidence,
        "confidence_band": "confident" if confidence >= LOW_CONFIDENCE_THRESHOLD else "low",
        "is_healthy": is_healthy,
        "symptoms": symptoms,
        "treatment": treatment,
        "precautions": precautions,
        "advisory": advisory,
        "review_status": review_status,
        "disclaimer": disclaimer,
        "model_version": prediction.get("model_version"),
        "created_at": prediction["created_at"],
    }


def _assert_owner(user: AuthenticatedUser, case: dict | None) -> dict:
    # 404 (not 403) whether the case doesn't exist or just isn't the caller's — doesn't confirm
    # or deny that a guessed id belongs to someone else (rule: 404 = not found / intentionally hidden).
    # Owner only: D11 makes prediction a farmer action, so an admin reads a case but never runs the model on it.
    if case is None or case["user_id"] != user.id:
        raise HTTPException(status_code=404, detail="Disease case not found")
    return case


async def create_case(user: AuthenticatedUser, crop_id: str | None, storage_path: str) -> dict:
    # Server-side ownership check beyond the schema's regex (Field pattern in ai/schemas.py
    # can validate shape, not identity): the folder segment must be the caller's own id, so one
    # user can never create a case pointing at another user's uploaded object.
    if not storage_path.startswith(f"{user.id}/"):
        raise HTTPException(status_code=422, detail="storage_path must be under your own user id.")
    case = await disease_repository.create_case(user.id, crop_id, storage_path)
    return await _with_signed_url(case)


def _is_missing_object(exc: StorageApiError) -> bool:
    """True when storage says the object is not there.

    Supabase Storage answers a missing object with `{"statusCode": "404", "error": "not_found"}` (older servers used
    the S3 code `NoSuchKey`); any other storage error is a real fault and must still surface."""
    return str(exc.status) == "404" or str(exc.code).lower() in {"not_found", "nosuchkey"}


async def _with_signed_url(case: dict) -> dict:
    """Replaces the stored storage_path with a freshly minted signed URL before the response
    ever leaves the service layer — the disease-images bucket is private (security fix C2), so a
    raw path is never returned to a client.

    A photo object that is gone from storage (removed by an operator, or a legacy row) gives
    `image_signed_url: None` and the case still loads: the report and the expert route matter more
    than the picture, and the app shows a placeholder instead (A6 verification)."""
    storage_path = case.pop("storage_path")
    try:
        signed_url = await disease_repository.create_signed_url(storage_path, expires_in=_SIGNED_URL_SECONDS)
    except StorageApiError as exc:
        if not _is_missing_object(exc):
            raise
        case["image_signed_url"] = None
        return case
    if signed_url is None:
        # Storage answered without a link, which it does not do for a missing object (that is the error above): a
        # server-side fault, not something the caller did, so a 500, not the generic 422 used for bad input.
        raise HTTPException(status_code=500, detail="Could not prepare the case image for display.")
    case["image_signed_url"] = signed_url
    return case


async def fetch_case_report(access_token: str, case_id: str) -> dict | None:
    """The case, a signed link to its photo, its latest prediction and the AI report, read as the caller.

    Public for the consultations module (the assigned expert reads the case a consultation is about); the result has
    the fields of schemas.DiseaseCaseWithPredictionResponse. Row-level security decides who sees the case: the owner,
    an admin, or the expert assigned through a live consultation (is_case_expert, 20261022080000). None when the case
    does not exist or the caller may not see it. The photo link is then signed with the service role, because the
    bucket's own policies admit only the uploader; the path signed is the one RLS just returned to this caller, never
    a client-supplied one."""
    case = await disease_repository.get_case_with_prediction_as_user(access_token, case_id)
    if case is None:
        return None
    predictions = sorted(case.get("prediction") or [], key=lambda p: p["created_at"], reverse=True)
    prediction = predictions[0] if predictions else None
    case["prediction"] = prediction
    case["report"] = None
    if prediction is not None:
        index = _index_knowledge(await disease_repository.list_knowledge_as_user(access_token))
        case["report"] = build_report(prediction, index.get(_match_key(prediction["predicted_disease"])))
    return await _with_signed_url(case)


async def get_case_for_user(user: AuthenticatedUser, disease_case_id: str) -> dict:
    case = await fetch_case_report(user.access_token, disease_case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Disease case not found")
    return case


async def list_knowledge(user: AuthenticatedUser) -> list[dict]:
    return await disease_repository.list_knowledge_as_user(user.access_token)


async def _fail(case_id: str, reason: str, status_code: int, detail: str) -> HTTPException:
    """Records the failure on the case before the error goes back, so a case never stays `pending` after a run."""
    await disease_repository.set_case_status(case_id, "failed", reason)
    return HTTPException(status_code=status_code, detail=detail)


async def predict(user: AuthenticatedUser, disease_case_id: str) -> dict:
    case = _assert_owner(user, await disease_repository.get_disease_case(disease_case_id))
    case_id = case["id"]

    try:
        image_bytes = await disease_repository.download_case_image(case["storage_path"])
    # StorageException: the storage API returned an error response (e.g. the object doesn't
    # exist). httpx.HTTPError: a network-level failure before storage3 could even respond (both
    # are the realistic failure modes of the underlying storage3 client — see file_api.py, which
    # only catches HTTPStatusError itself and re-raises as StorageException).
    except (StorageException, httpx.HTTPError) as exc:
        # Any storage failure (object missing, network, permissions) — one message for all of
        # them, so a response can't be used to tell "doesn't exist" from "exists but broken".
        # `from exc` keeps the real cause in server-side logs; the client only ever sees the
        # generic detail above.
        raise await _fail(case_id, _FAILURE_IMAGE, 422, _IMAGE_FETCH_ERROR) from exc

    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise await _fail(case_id, _FAILURE_IMAGE, 422, _IMAGE_FETCH_ERROR)

    try:
        # A CPU-bound forward pass: run in a worker thread so it cannot stall every other request on the
        # event loop (P5 item 2, "inference moves to a threadpool"). torch releases the GIL while computing.
        class_label, confidence = await asyncio.to_thread(get_classifier().predict, image_bytes)
    except ModelUnavailableError as exc:
        raise await _fail(case_id, _FAILURE_MODEL_UNAVAILABLE, 503, _MODEL_UNAVAILABLE_DETAIL) from exc
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise await _fail(case_id, _FAILURE_IMAGE, 422, _IMAGE_FETCH_ERROR) from exc

    # The raw label is the knowledge table's key, so the lookup needs no mapping (SRDS §34-§35).
    knowledge = await disease_repository.get_knowledge(class_label)
    if knowledge is not None:
        predicted_disease = _label(knowledge["crop"], knowledge["disease"])
        description: str = knowledge["advisory"]
        recommended_actions: list[str] = list(knowledge.get("treatment") or [])
    else:
        predicted_disease = _label(*_fallback_names(class_label))
        description, recommended_actions = _FALLBACK_ADVISORY, []

    # The prediction row keeps the text shown at the time, as history; a later report reads the live knowledge row.
    prediction = await disease_repository.insert_prediction(
        disease_case_id=case_id,
        predicted_disease=predicted_disease,
        confidence_score=confidence,
        description=description,
        recommended_actions=recommended_actions,
        model_version=settings.model_version,
    )
    await disease_repository.set_case_status(case_id, "predicted", None)
    prediction["report"] = build_report(prediction, knowledge, class_label)
    return prediction
