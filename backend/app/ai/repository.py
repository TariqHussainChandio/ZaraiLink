from app.common.rows import as_rows, first_row, maybe_row
from app.database.supabase_client import get_service_role_client, get_user_scoped_client

_CASE_WITH_PREDICTION = "*, crop:crops(id,name), prediction:disease_predictions(*)"

# The writes, the storage calls and the single-case read for prediction use the service-role client, not the
# request-scoped one — documented exception #3 in docs/architecture/backend-architecture.md. Safe only because every
# call site in ai/service.py verifies ownership (case.user_id == caller.id) against
# the verified AuthenticatedUser before trusting anything this module returns — never against a
# client-supplied id. create_signed_url/download_case_image extend that same exception: the
# service layer never lets an unowned storage_path reach either of them.


async def get_disease_case(disease_case_id: str) -> dict | None:
    response = (
        await get_service_role_client().table("disease_cases").select("*").eq("id", disease_case_id).limit(1).execute()
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
    expert-documents pattern (expert/repository.py:create_document_signed_url)."""
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


async def set_case_status(disease_case_id: str, status: str, failure_reason: str | None = None) -> None:
    """Records the case's processing state.

    Service role on purpose: the migration grants `update (status, failure_reason)` to service_role only, so a farmer
    cannot mark their own case predicted or failed (20261022080000)."""
    await (
        get_service_role_client()
        .table("disease_cases")
        .update({"status": status, "failure_reason": failure_reason})
        .eq("id", disease_case_id)
        .execute()
    )


async def get_knowledge(class_label: str) -> dict | None:
    """The reviewed advisory text for one model class (service role holds select on disease_knowledge)."""
    response = await (
        get_service_role_client()
        .table("disease_knowledge")
        .select("*")
        .eq("class_label", class_label)
        .limit(1)
        .execute()
    )
    return maybe_row(response)


# The reads below run as the caller, not the service role: row-level security decides who sees a case (the owner,
# an admin, or the expert assigned through a consultation, is_case_expert in 20261022080000), so the API cannot drift
# from the database's own rule.


async def get_case_with_prediction_as_user(access_token: str, disease_case_id: str) -> dict | None:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("disease_cases").select(_CASE_WITH_PREDICTION).eq("id", disease_case_id).limit(1).execute()
    )
    return maybe_row(response)


async def list_knowledge_as_user(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("disease_knowledge").select("*").order("crop").order("disease").execute()
    return as_rows(response)
