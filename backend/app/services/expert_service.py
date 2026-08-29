from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..repositories import expert_repository as repo
from .audit_log_service import log_admin_action

def _to_location(country_id: str | None, province_id: str | None, city_id: str | None) -> dict | None:
    if not country_id and not province_id and not city_id:
        return None
    return {"country_id": country_id, "province_id": province_id, "city_id": city_id}


def _to_fields(profile) -> dict:
    return {
        "qualifications": profile.qualifications or None,
        "degree": profile.degree or None,
        "experience": profile.experience or None,
        "professional_description": profile.professional_description or None,
        "contact": profile.contact or None,
        "location": _to_location(profile.country_id, profile.province_id, profile.city_id),
    }


def submit_application(user: AuthenticatedUser, profile, document_path: str | None) -> dict:
    return repo.submit_application(user.access_token, user.id, _to_fields(profile), profile.specializations, document_path)


def update_profile(user: AuthenticatedUser, profile) -> dict:
    return repo.update_profile(user.access_token, user.id, _to_fields(profile), profile.specializations)


def fetch_my_profile(user: AuthenticatedUser) -> dict | None:
    return repo.fetch_expert_profile(user.id)


def fetch_expert_by_id(expert_id: str) -> dict:
    expert = repo.fetch_expert_by_id(expert_id)
    if expert is None:
        raise HTTPException(status_code=404, detail="Expert not found")
    return expert


def fetch_experts(specialization: str | None) -> list[dict]:
    expert_ids = None
    if specialization:
        expert_ids = repo.fetch_specialization_matches(specialization)
        if not expert_ids:
            return []
    return repo.fetch_experts(expert_ids)


def _sorted_verifications(expert: dict) -> dict:
    verifications = expert.get("expert_verifications") or []
    expert["expert_verifications"] = sorted(verifications, key=lambda v: v["created_at"], reverse=True)
    return expert


def fetch_experts_for_admin(user: AuthenticatedUser, status: str | None) -> list[dict]:
    experts = repo.fetch_experts_for_admin(user.access_token, status)
    return [_sorted_verifications(e) for e in experts]


def fetch_expert_for_admin_by_id(user: AuthenticatedUser, expert_id: str) -> dict:
    expert = repo.fetch_expert_for_admin_by_id(user.access_token, expert_id)
    if expert is None:
        raise HTTPException(status_code=404, detail="Expert not found")
    return _sorted_verifications(expert)


def review_verification(user: AuthenticatedUser, expert_id: str, verification_id: str, decision: str, notes: str | None) -> None:
    repo.review_verification(user.access_token, expert_id, verification_id, decision, notes, user.id)
    log_admin_action(
        user,
        f"expert_verification_{decision}",
        "experts",
        expert_id,
        new_state={"verification_status": decision},
        metadata={"notes": notes},
    )


def get_document_url(user: AuthenticatedUser, expert_id: str) -> str | None:
    """
    Doesn't accept a storage path from the client at all — the path is looked up server-side
    from the expert's own (sorted-newest-first) verification history, so the caller can only
    ever resolve the document that's actually associated with the expertId they asked about
    (rule: "verify the requested expert/document relationship before generating a signed URL").
    """
    expert = fetch_expert_for_admin_by_id(user, expert_id)
    verifications = expert.get("expert_verifications") or []
    if not verifications or not verifications[0].get("document_url"):
        return None
    return repo.create_document_signed_url(user.access_token, verifications[0]["document_url"])
