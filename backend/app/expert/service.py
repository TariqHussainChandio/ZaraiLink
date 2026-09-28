from fastapi import HTTPException

from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
from app.expert import repository as repo


def _to_location(country: str | None, province: str | None, city: str | None) -> dict | None:
    if not country and not province and not city:
        return None
    return {"country": country, "province": province, "city": city}


def _to_fields(profile) -> dict:
    return {
        "qualifications": profile.qualifications or None,
        "degree": profile.degree or None,
        "experience": profile.experience or None,
        "professional_description": profile.professional_description or None,
        "contact": profile.contact or None,
        "location": _to_location(profile.country, profile.province, profile.city),
    }


async def submit_application(user: AuthenticatedUser, profile, document_path: str | None) -> dict:
    return await repo.submit_application(
        user.access_token, user.id, _to_fields(profile), profile.specializations, document_path
    )


async def update_profile(user: AuthenticatedUser, profile) -> dict:
    return await repo.update_profile(user.access_token, user.id, _to_fields(profile), profile.specializations)


async def fetch_my_profile(user: AuthenticatedUser) -> dict | None:
    return await repo.fetch_own_expert_profile(user.access_token, user.id)


async def find_expert(expert_id: str) -> dict | None:
    """A verified expert, or None: for callers that decide themselves what a missing expert means."""
    return await repo.fetch_expert_by_id(expert_id)


async def fetch_expert_by_id(expert_id: str) -> dict:
    expert = await repo.fetch_expert_by_id(expert_id)
    if expert is None:
        raise HTTPException(status_code=404, detail="Expert not found")
    return expert


async def fetch_experts(specialization: str | None) -> list[dict]:
    expert_ids = None
    if specialization:
        expert_ids = await repo.fetch_specialization_matches(specialization)
        if not expert_ids:
            return []
    return await repo.fetch_experts(expert_ids)


def _sorted_verifications(expert: dict) -> dict:
    verifications = expert.get("expert_verifications") or []
    expert["expert_verifications"] = sorted(verifications, key=lambda v: v["created_at"], reverse=True)
    return expert


async def fetch_experts_for_admin(user: AuthenticatedUser, status: str | None) -> list[dict]:
    experts = await repo.fetch_experts_for_admin(user.access_token, status)
    return [_sorted_verifications(e) for e in experts]


async def fetch_expert_for_admin_by_id(user: AuthenticatedUser, expert_id: str) -> dict:
    expert = await repo.fetch_expert_for_admin_by_id(user.access_token, expert_id)
    if expert is None:
        raise HTTPException(status_code=404, detail="Expert not found")
    return _sorted_verifications(expert)


async def review_verification(
    user: AuthenticatedUser, expert_id: str, verification_id: str, decision: str, notes: str | None
) -> None:
    await repo.review_verification(user.access_token, expert_id, verification_id, decision, notes, user.id)
    await log_admin_action(
        user,
        f"expert_verification_{decision}",
        "experts",
        expert_id,
        new_state={"verification_status": decision},
        metadata={"notes": notes},
    )


async def get_document_url(user: AuthenticatedUser, expert_id: str) -> str | None:
    """
    Doesn't accept a storage path from the client at all — the path is looked up server-side
    from the expert's own (sorted-newest-first) verification history, so the caller can only
    ever resolve the document that's actually associated with the expertId they asked about
    (rule: "verify the requested expert/document relationship before generating a signed URL").
    """
    expert = await fetch_expert_for_admin_by_id(user, expert_id)
    verifications = expert.get("expert_verifications") or []
    if not verifications or not verifications[0].get("document_url"):
        return None
    return await repo.create_document_signed_url(user.access_token, verifications[0]["document_url"])
