from ..core.rows import as_rows, first_row
from ..core.supabase_client import get_service_role_client

# Uses the service-role client, not the request-scoped one — documented exception #3 in
# docs/architecture/backend-architecture.md. Safe only because every call site in
# services/disease_service.py verifies ownership (case.user_id == caller.id, or admin) against
# the verified AuthenticatedUser before trusting anything this module returns — never against a
# client-supplied id. create_signed_url/download_case_image extend that same exception: the
# service layer never lets an unowned storage_path reach either of them.


async def get_disease_case(disease_case_id: str) -> dict | None:
    response = (
        await get_service_role_client().table("disease_cases").select("*").eq("id", disease_case_id).limit(1).execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def get_case_with_prediction(disease_case_id: str) -> dict | None:
    response = await (
        get_service_role_client()
        .table("disease_cases")
        .select("*, crop:crops(id,name), prediction:disease_predictions(*)")
        .eq("id", disease_case_id)
        .limit(1)
        .execute()
    )
    rows = as_rows(response)
    return rows[0] if rows else None


async def create_case(user_id: str, crop_id: str | None, storage_path: str) -> dict:
    response = await (
        get_service_role_client()
        .table("disease_cases")
        .insert({"user_id": user_id, "crop_id": crop_id, "storage_path": storage_path})
        .execute()
    )
    return first_row(response)


async def create_signed_url(storage_path: str, expires_in: int = 3600) -> str | None:
    """Mints a time-limited URL for display — the bucket is private (security fix C2), so this
    is the only way a case's photo is ever handed back to a client. Same shape as the existing
    expert-documents pattern (repositories/expert_repository.py:create_document_signed_url)."""
    response = (
        await get_service_role_client().storage.from_("disease-images").create_signed_url(storage_path, expires_in)
    )
    return response.get("signedUrl") or response.get("signedURL")


async def download_case_image(storage_path: str) -> bytes:
    """Fetches the case photo's bytes for inference through the Storage API — replaces the old
    `httpx.get(client_supplied_url)` (the SSRF fixed by C2). Raises whatever the supabase-py
    storage client raises (e.g. `StorageException`) on a missing/inaccessible object; the caller
    (disease_service.predict) maps every failure here to the same generic error, so a caller can't
    use the response to probe which paths exist."""
    data = await get_service_role_client().storage.from_("disease-images").download(storage_path)
    return bytes(data)


async def insert_prediction(
    disease_case_id: str,
    predicted_disease: str,
    confidence_score: float,
    description: str | None,
    recommended_actions: list[str],
    model_version: str | None,
) -> dict:
    response = await (
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
    return first_row(response)
