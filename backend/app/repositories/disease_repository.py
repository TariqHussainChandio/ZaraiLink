from ..core.supabase_client import get_service_role_client

# Uses the service-role client, not the request-scoped one — documented exception #3 in
# docs/architecture/backend-architecture.md. Safe only because every call site in
# services/disease_service.py verifies ownership (case.user_id == caller.id, or admin) against
# the verified AuthenticatedUser before trusting anything this module returns — never against a
# client-supplied id.


def get_disease_case(disease_case_id: str) -> dict | None:
    response = get_service_role_client().table("disease_cases").select("*").eq("id", disease_case_id).limit(1).execute()
    rows = response.data or []
    return rows[0] if rows else None


def get_case_with_prediction(disease_case_id: str) -> dict | None:
    response = (
        get_service_role_client()
        .table("disease_cases")
        .select("*, crop:crops(id,name), prediction:disease_predictions(*)")
        .eq("id", disease_case_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def create_case(user_id: str, crop_id: str | None, image_url: str) -> dict:
    response = (
        get_service_role_client()
        .table("disease_cases")
        .insert({"user_id": user_id, "crop_id": crop_id, "image_url": image_url})
        .execute()
    )
    return response.data[0]


def insert_prediction(
    disease_case_id: str,
    predicted_disease: str,
    confidence_score: float,
    description: str | None,
    recommended_actions: list[str],
    model_version: str | None,
) -> dict:
    response = (
        get_service_role_client()
        .table("disease_predictions")
        .insert(
            {
                "disease_case_id": disease_case_id,
                "predicted_disease": predicted_disease,
                "confidence_score": confidence_score,
                "description": description,
                "recommended_actions": recommended_actions,
                "model_version": model_version,
            }
        )
        .execute()
    )
    return response.data[0]
