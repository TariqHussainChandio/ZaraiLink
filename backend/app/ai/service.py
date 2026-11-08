import asyncio
import re

import httpx
from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from storage3.utils import StorageException

from app.ai import repository as disease_repository
from app.ai.engine import ModelUnavailableError, get_classifier
from app.auth.dependencies import AuthenticatedUser
from app.config.settings import settings

# Security fix C2: the server used to fetch whatever URL the client sent (a blind SSRF, confirmed
# in the P0 baseline). The image now always comes from our own private storage bucket, addressed
# by a path the caller must own — never a client-chosen host. Every failure in that path (object
# missing, too large, not a real image) maps to this one generic message, so a response can never
# be used to tell those cases apart from the outside.
_IMAGE_FETCH_ERROR = "Could not process the case image."
_MAX_IMAGE_BYTES = 8 * 1024 * 1024  # 8 MB, matches the disease-images bucket's file_size_limit

# Advisory copy for the 38-class PlantVillage taxonomy the real model (backend/app/ai/checkpoints/)
# is trained on. Keyed by the RAW taxonomy string exactly as it appears in class_names.json/
# model_metadata.json (e.g. "Tomato___Late_blight") — this dict is a curated table, not something
# generated from metadata, so keys were copy-pasted from class_names.json rather than retyped, to
# avoid a transcription mismatch with the model's actual output.
#
# Per BR-13 (AI results are advisory only, never a diagnosis): every entry uses "may indicate"
# language, not "you have," and every non-healthy entry's last action item is to consult an expert
# — this reinforces the advisory framing structurally, not just via the UI disclaimer.
DESCRIPTIONS: dict[str, tuple[str, list[str]]] = {
    "Apple___Apple_scab": (
        "The leaf pattern may indicate apple scab, a fungal disease that causes dark, "
        "scab-like lesions on leaves and fruit and spreads readily in cool, wet spring weather.",
        [
            "Rake up and destroy fallen leaves to reduce next season's spore load.",
            "Improve air circulation by pruning to open up the canopy.",
            "Avoid overhead irrigation that keeps foliage wet.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Apple___Black_rot": (
        "The leaf pattern may indicate black rot, a fungal disease that produces purple-bordered "
        "leaf spots and can also rot fruit and cankers on branches.",
        [
            "Prune out and destroy dead or cankered wood, a common source of reinfection.",
            "Remove mummified fruit left on the tree or ground.",
            "Consult an agricultural expert to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Apple___Cedar_apple_rust": (
        "The leaf pattern may indicate cedar apple rust, a fungal disease that needs a nearby "
        "juniper/cedar host to complete its life cycle and shows as bright orange-yellow leaf spots.",
        [
            "If practical, identify and remove nearby juniper/cedar hosts within a few hundred meters.",
            "Remove and destroy affected leaves to limit spread.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide timing.",
        ],
    ),
    "Apple___healthy": (
        "No signs of disease detected on this apple leaf.",
        ["Continue routine monitoring.", "Maintain good spacing and airflow between trees."],
    ),
    "Blueberry___healthy": (
        "No signs of disease detected on this blueberry leaf.",
        ["Continue routine monitoring.", "Maintain consistent soil moisture and good drainage."],
    ),
    "Cherry_(including_sour)___Powdery_mildew": (
        "The leaf pattern may indicate powdery mildew, a fungal disease that coats leaves in a "
        "white, powdery growth and thrives in warm, humid conditions with poor air circulation.",
        [
            "Prune to improve air circulation around affected branches.",
            "Avoid excess nitrogen fertilizer, which encourages susceptible new growth.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Cherry_(including_sour)___healthy": (
        "No signs of disease detected on this cherry leaf.",
        ["Continue routine monitoring.", "Maintain good spacing and airflow between trees."],
    ),
    "Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot": (
        "The leaf pattern may indicate gray leaf spot, a fungal disease that produces narrow, "
        "rectangular gray-to-tan lesions and spreads fastest in humid, poorly ventilated fields.",
        [
            "Rotate away from corn for a season if this field has a history of the disease.",
            "Consider a more resistant hybrid for future plantings.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide timing.",
        ],
    ),
    "Corn_(maize)___Common_rust_": (
        "The leaf pattern may indicate common rust, a fungal disease that produces small, "
        "reddish-brown pustules scattered across both leaf surfaces.",
        [
            "Monitor closely — most modern hybrids tolerate common rust well without treatment.",
            "Consult an agricultural expert if pustules are dense or the crop is young and stressed.",
        ],
    ),
    "Corn_(maize)___Northern_Leaf_Blight": (
        "The leaf pattern may indicate northern leaf blight, a fungal disease that causes long, "
        "cigar-shaped gray-green lesions and can spread quickly in humid weather.",
        [
            "Consider a more resistant hybrid for future plantings.",
            "Rotate away from corn for a season if this field has a history of the disease.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Corn_(maize)___healthy": (
        "No signs of disease detected on this corn leaf.",
        ["Continue routine monitoring.", "Maintain balanced fertilization and field drainage."],
    ),
    "Grape___Black_rot": (
        "The leaf pattern may indicate black rot, a fungal disease that produces reddish-brown "
        "circular leaf spots and can cause fruit to shrivel into hard, black mummies.",
        [
            "Remove mummified fruit and infected leaf debris — the fungus overwinters in them.",
            "Improve air circulation through canopy management.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide timing.",
        ],
    ),
    "Grape___Esca_(Black_Measles)": (
        "The leaf pattern may indicate esca (black measles), a fungal trunk disease that causes "
        "characteristic 'tiger-stripe' interveinal discoloration and can affect vines for years.",
        [
            "Avoid large pruning wounds during wet weather, a common infection point.",
            "Consult an agricultural expert — trunk diseases like this often need vine-by-vine assessment.",
        ],
    ),
    "Grape___Leaf_blight_(Isariopsis_Leaf_Spot)": (
        "The leaf pattern may indicate Isariopsis leaf blight, a fungal disease that produces "
        "angular brown spots that can merge and cause early leaf drop.",
        [
            "Improve air circulation through canopy management.",
            "Remove and destroy heavily affected leaves.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Grape___healthy": (
        "No signs of disease detected on this grape leaf.",
        ["Continue routine monitoring.", "Maintain good canopy airflow."],
    ),
    "Orange___Haunglongbing_(Citrus_greening)": (
        "The leaf pattern may indicate citrus greening (Huanglongbing), a serious bacterial "
        "disease spread by psyllid insects that causes blotchy yellowing and can be fatal to the tree.",
        [
            "Isolate and closely monitor this tree — this disease can spread to nearby citrus.",
            "Consult an agricultural expert urgently — citrus greening has no cure and early "
            "management (including possible tree removal) significantly affects nearby trees.",
        ],
    ),
    "Peach___Bacterial_spot": (
        "The leaf pattern may indicate bacterial spot, which produces small, dark, angular leaf "
        "lesions that can drop out and leave a 'shot-hole' appearance, and also affects fruit.",
        [
            "Avoid overhead irrigation and working around wet trees, which spreads bacteria.",
            "Consult an agricultural expert to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Peach___healthy": (
        "No signs of disease detected on this peach leaf.",
        ["Continue routine monitoring.", "Maintain good spacing and airflow between trees."],
    ),
    "Pepper,_bell___Bacterial_spot": (
        "The leaf pattern may indicate bacterial spot, which produces small, water-soaked leaf "
        "spots that darken and can also blemish fruit; it spreads readily in warm, wet conditions.",
        [
            "Avoid overhead watering and handling plants while foliage is wet.",
            "Remove and destroy heavily affected plants to limit spread.",
            "Consult an agricultural expert to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Pepper,_bell___healthy": (
        "No signs of disease detected on this bell pepper leaf.",
        ["Continue routine monitoring.", "Maintain consistent watering at the base of the plant."],
    ),
    "Potato___Early_blight": (
        "The leaf pattern may indicate early blight, a fungal disease that produces dark, "
        "target-like concentric rings on older leaves first, common in warm, humid conditions.",
        [
            "Remove and destroy affected lower leaves to slow spread upward.",
            "Ensure adequate plant spacing for airflow.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Potato___Late_blight": (
        "The leaf pattern may indicate late blight, an aggressive fungal-like disease that "
        "spreads quickly in cool, wet conditions and can destroy a crop within days if untreated.",
        [
            "Remove and destroy visibly affected foliage immediately to slow spread.",
            "Avoid overhead watering; water at the base of the plant.",
            "Consult an agricultural expert urgently to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Potato___healthy": (
        "No signs of disease detected on this potato leaf.",
        ["Continue routine monitoring.", "Maintain consistent watering and good field drainage."],
    ),
    "Raspberry___healthy": (
        "No signs of disease detected on this raspberry leaf.",
        ["Continue routine monitoring.", "Maintain good airflow between canes."],
    ),
    "Soybean___healthy": (
        "No signs of disease detected on this soybean leaf.",
        ["Continue routine monitoring.", "Maintain balanced fertilization and field drainage."],
    ),
    "Squash___Powdery_mildew": (
        "The leaf pattern may indicate powdery mildew, a fungal disease that coats leaves in a "
        "white, powdery growth and thrives in warm, humid conditions with poor air circulation.",
        [
            "Improve air circulation by spacing plants and pruning dense growth.",
            "Avoid overhead watering late in the day.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Strawberry___Leaf_scorch": (
        "The leaf pattern may indicate leaf scorch, a fungal disease that produces small purple "
        "spots that merge into larger scorched-looking blotches.",
        [
            "Remove and destroy old or heavily affected leaves after harvest.",
            "Ensure adequate plant spacing for airflow.",
            "Consult an agricultural expert to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Strawberry___healthy": (
        "No signs of disease detected on this strawberry leaf.",
        ["Continue routine monitoring.", "Maintain good airflow and avoid overcrowding plants."],
    ),
    "Tomato___Bacterial_spot": (
        "The leaf pattern may indicate bacterial spot, which produces small, water-soaked leaf "
        "spots that darken and can also blemish fruit; it spreads readily in warm, wet conditions.",
        [
            "Avoid overhead watering and handling plants while foliage is wet.",
            "Remove and destroy heavily affected plants to limit spread.",
            "Consult an agricultural expert to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Tomato___Early_blight": (
        "The leaf pattern may indicate early blight, a fungal disease that produces dark, "
        "target-like concentric rings on older leaves first, common in warm, humid conditions.",
        [
            "Remove and destroy affected lower leaves to slow spread upward.",
            "Ensure adequate plant spacing for airflow.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Tomato___Late_blight": (
        "The leaf pattern may indicate late blight, an aggressive fungal-like disease that "
        "spreads quickly in cool, wet conditions and can destroy a tomato crop within days if untreated.",
        [
            "Remove and destroy visibly affected foliage immediately to slow spread.",
            "Avoid overhead watering; water at the base of the plant.",
            "Consult an agricultural expert urgently to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Tomato___Leaf_Mold": (
        "The leaf pattern may indicate leaf mold, a fungal disease that produces pale spots on "
        "upper leaf surfaces with an olive-green to gray velvety growth underneath, favored by "
        "high humidity and poor ventilation.",
        [
            "Improve ventilation, especially in greenhouses or high tunnels.",
            "Avoid overhead watering and reduce humidity around plants where possible.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Tomato___Septoria_leaf_spot": (
        "The leaf pattern may indicate septoria leaf spot, a fungal disease that produces many "
        "small, circular spots with dark borders and tan centers, usually starting on lower leaves.",
        [
            "Remove and destroy affected lower leaves to slow spread upward.",
            "Avoid overhead watering; water at the base of the plant.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Tomato___Spider_mites Two-spotted_spider_mite": (
        "The leaf pattern may indicate two-spotted spider mite damage — tiny pests that cause "
        "fine stippling/speckling on leaves and fine webbing in heavy infestations, worse in hot, dry weather.",
        [
            "Check the undersides of leaves closely, and nearby plants, for mites and webbing.",
            "Increasing humidity around plants can slow mite reproduction.",
            "Consult an agricultural expert to confirm the diagnosis and discuss treatment options.",
        ],
    ),
    "Tomato___Target_Spot": (
        "The leaf pattern may indicate target spot, a fungal disease that produces circular "
        "lesions with concentric rings, similar in appearance to early blight.",
        [
            "Remove and destroy affected leaves to slow spread.",
            "Ensure adequate plant spacing for airflow.",
            "Consult an agricultural expert to confirm the diagnosis and discuss fungicide options.",
        ],
    ),
    "Tomato___Tomato_Yellow_Leaf_Curl_Virus": (
        "The leaf pattern may indicate tomato yellow leaf curl virus, spread by whiteflies, which "
        "causes upward-curling, yellowing leaves and stunted growth — there is no cure once infected.",
        [
            "Inspect for whiteflies on leaf undersides, the main way this virus spreads.",
            "Isolate or remove severely affected plants to protect nearby healthy ones.",
            "Consult an agricultural expert to confirm the diagnosis and discuss whitefly management.",
        ],
    ),
    "Tomato___Tomato_mosaic_virus": (
        "The leaf pattern may indicate tomato mosaic virus, which causes mottled light and dark "
        "green patches and can distort leaves — it spreads easily through touch/tools and has no cure.",
        [
            "Wash hands and disinfect tools between handling plants to avoid spreading the virus.",
            "Remove and destroy severely affected plants.",
            "Consult an agricultural expert to confirm the diagnosis and discuss management options.",
        ],
    ),
    "Tomato___healthy": (
        "No signs of disease detected on this tomato leaf.",
        ["Continue routine monitoring.", "Maintain consistent watering at the base of the plant."],
    ),
}

# Used whenever a prediction's raw class isn't (yet) in DESCRIPTIONS above — should never be
# reached in normal operation once every model_classes entry has a matching key, but this is a
# real, non-empty fallback rather than the previous (None, []), which would otherwise silently
# hand back a bare label with no advisory copy at all.
DEFAULT_DESCRIPTION: tuple[str, list[str]] = (
    "Our AI has flagged a possible issue with this crop, but detailed guidance for this "
    "specific condition isn't available yet.",
    ["Consult an agricultural expert to confirm the diagnosis and get a treatment plan."],
)


# D16: the scan offers only the crops the model was trained on. The list is derived from the model's own
# class list (model_metadata.json via settings.model_classes, which checkpoints/class_names.json mirrors; a test
# keeps the two equal), so a retrained model changes the offer with no code edit. Only the farmer-facing names
# of three taxonomy strings are curated; every other crop uses its taxonomy name as is.
_CROP_DISPLAY_NAMES = {
    "Corn_(maize)": "Maize",
    "Pepper,_bell": "Bell pepper",
    "Cherry_(including_sour)": "Cherry",
}


def _crop_of_class(raw_class: str) -> dict[str, str]:
    crop_part = raw_class.partition("___")[0]
    name = _CROP_DISPLAY_NAMES.get(crop_part) or crop_part.replace("_", " ").strip()
    return {"key": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"), "name": name}


def supported_crops() -> list[dict[str, str]]:
    """The crops the model knows, as `{key, name}` sorted by name (the scan screen's only crop choices)."""
    unique = {crop["key"]: crop for crop in map(_crop_of_class, settings.model_classes)}
    return sorted(unique.values(), key=lambda crop: crop["name"])


def _humanize_class_name(raw: str) -> str:
    """Turns a raw PlantVillage taxonomy label (e.g. "Tomato___Late_blight",
    "Corn_(maize)___Common_rust_") into a farmer-facing display string
    (e.g. "Tomato — Late blight", "Corn (maize) — Common rust"). A pure string transform with no
    ML/config dependency, so it's trivially unit-testable against every known raw label.

    This is applied only to the value stored/returned as `predicted_disease` — the DESCRIPTIONS
    lookup above must happen against the RAW label first (see predict() below), since that dict's
    keys are the raw taxonomy strings, not the humanized ones.
    """
    crop_part, _, disease_part = raw.partition("___")
    crop_display = crop_part.replace("_", " ").strip()
    disease_display = disease_part.replace("_", " ").strip()
    if disease_display.lower() == "healthy":
        return f"{crop_display} — Healthy"
    disease_display = disease_display[:1].upper() + disease_display[1:]
    return f"{crop_display} — {disease_display}"


def _assert_owner_or_admin(user: AuthenticatedUser, case: dict | None) -> dict:
    # 404 (not 403) whether the case doesn't exist or just isn't the caller's — doesn't confirm
    # or deny that a guessed id belongs to someone else (rule: 404 = not found / intentionally hidden).
    if case is None or (case["user_id"] != user.id and user.role != "admin"):
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


async def _with_signed_url(case: dict) -> dict:
    """Replaces the stored storage_path with a freshly minted signed URL before the response
    ever leaves the service layer — the disease-images bucket is private (security fix C2), so a
    raw path is never returned to a client."""
    storage_path = case.pop("storage_path")
    signed_url = await disease_repository.create_signed_url(storage_path, expires_in=86400)
    if signed_url is None:
        # The object the case row points at is gone or the signing call itself failed — a
        # server-side fault, not something the caller did, so this is a 500, not the generic
        # client-facing 422 used above for bad input.
        raise HTTPException(status_code=500, detail="Could not prepare the case image for display.")
    case["image_signed_url"] = signed_url
    return case


async def get_case_for_user(user: AuthenticatedUser, disease_case_id: str) -> dict:
    case = _assert_owner_or_admin(user, await disease_repository.get_case_with_prediction(disease_case_id))
    predictions = case.get("prediction") or []
    case["prediction"] = predictions[0] if predictions else None
    return await _with_signed_url(case)


async def predict(user: AuthenticatedUser, disease_case_id: str, chosen_crop: str | None = None) -> dict:
    """Runs the model on the case photo. `chosen_crop` is a `supported_crops()` key the farmer picked; when the model
    reads the photo as a different crop the response says `crop_matches: false` and carries no description or
    actions, because a report for the wrong crop would be a confident answer about the wrong plant (BR-13, D16)."""
    if chosen_crop is not None and chosen_crop not in {crop["key"] for crop in supported_crops()}:
        raise HTTPException(status_code=422, detail="chosen_crop is not a crop the AI advisory supports.")
    case = _assert_owner_or_admin(user, await disease_repository.get_disease_case(disease_case_id))

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
        raise HTTPException(status_code=422, detail=_IMAGE_FETCH_ERROR) from exc

    if len(image_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail=_IMAGE_FETCH_ERROR)

    try:
        # A CPU-bound forward pass: run in a worker thread so it cannot stall every other request on the
        # event loop (P5 item 2, "inference moves to a threadpool"). torch releases the GIL while computing.
        raw_predicted_disease, confidence = await asyncio.to_thread(get_classifier().predict, image_bytes)
    except ModelUnavailableError as exc:
        raise HTTPException(
            status_code=503,
            detail="AI model not trained yet — check back once model.pth has been trained.",
        ) from exc
    except (UnidentifiedImageError, Image.DecompressionBombError) as exc:
        raise HTTPException(status_code=422, detail=_IMAGE_FETCH_ERROR) from exc

    # Look up advisory copy by the RAW label (DESCRIPTIONS' keys) before humanizing — the
    # humanized string below is presentation-only and must not be used for this lookup.
    description, recommended_actions = DESCRIPTIONS.get(raw_predicted_disease, DEFAULT_DESCRIPTION)

    predicted_crop = _crop_of_class(raw_predicted_disease)
    crop_matches = None if chosen_crop is None else predicted_crop["key"] == chosen_crop

    stored = await disease_repository.insert_prediction(
        disease_case_id=case["id"],
        predicted_disease=_humanize_class_name(raw_predicted_disease),
        confidence_score=confidence,
        description=description,
        recommended_actions=recommended_actions,
        model_version=settings.model_version,
    )
    # The row keeps the model's full output so an expert can read it as the AI's suggestion; the farmer's response
    # drops the report text when the crop does not match.
    response = {**stored, "predicted_crop": predicted_crop, "crop_matches": crop_matches}
    if crop_matches is False:
        response.update(description=None, recommended_actions=[])
    return response
