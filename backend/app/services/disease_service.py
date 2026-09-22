import httpx
from fastapi import HTTPException
from PIL import UnidentifiedImageError

from ..core.auth import AuthenticatedUser
from ..core.config import settings
from ..repositories import disease_repository
from .ai_engine import ModelUnavailableError, classifier

# Advisory copy for the 38-class PlantVillage taxonomy the real model (backend/app/ml/checkpoints/)
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
        raw_predicted_disease, confidence = classifier.predict(image_response.content)
    except ModelUnavailableError:
        raise HTTPException(
            status_code=503,
            detail="AI model not trained yet — check back once model.pth has been trained.",
        )
    except UnidentifiedImageError:
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid image.")

    # Look up advisory copy by the RAW label (DESCRIPTIONS' keys) before humanizing — the
    # humanized string below is presentation-only and must not be used for this lookup.
    description, recommended_actions = DESCRIPTIONS.get(raw_predicted_disease, DEFAULT_DESCRIPTION)

    return disease_repository.insert_prediction(
        disease_case_id=case["id"],
        predicted_disease=_humanize_class_name(raw_predicted_disease),
        confidence_score=confidence,
        description=description,
        recommended_actions=recommended_actions,
        model_version=settings.model_version,
    )
