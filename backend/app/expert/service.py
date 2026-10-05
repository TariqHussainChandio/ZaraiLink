from fastapi import HTTPException

from app.auth.dependencies import AuthenticatedUser
from app.common import account_status
from app.common import application_documents as documents
from app.common.errors import AppHTTPException
from app.common.notifications import service as notifications
from app.expert import repository as repo


def _to_location(country: str | None, province: str | None, city: str | None) -> dict | None:
    if not country and not province and not city:
        return None
    return {"country": country, "province": province, "city": city}


def _to_fields(profile) -> dict:
    fields = {
        "qualifications": profile.qualifications or None,
        "degree": profile.degree or None,
        "experience": profile.experience or None,
        "professional_description": profile.professional_description or None,
        "contact": profile.contact or None,
        "location": _to_location(profile.country, profile.province, profile.city),
    }
    # Left out when not sent, so an edit from a form without them (an approved expert's profile) keeps them.
    if profile.years_experience is not None:
        fields["years_experience"] = profile.years_experience
    if profile.institution_affiliation is not None:
        fields["institution_affiliation"] = profile.institution_affiliation.strip()
    return fields


async def create_application(user: AuthenticatedUser, profile) -> dict:
    created = await repo.create_application(user.access_token, user.id, _to_fields(profile), profile.specializations)
    if created is None:
        raise AppHTTPException(403, documents.LOCKED, "application_locked")
    return created


async def update_profile(user: AuthenticatedUser, profile) -> dict:
    updated = await repo.update_profile(user.access_token, user.id, _to_fields(profile), profile.specializations)
    if updated is None:
        # Their own row is there but the policies hid it from the update: frozen under review (A3b verification, L5).
        if await repo.fetch_own_expert_profile(user.access_token, user.id) is None:
            raise AppHTTPException(404, "Fill in your professional details first", "not_found")
        raise AppHTTPException(403, documents.LOCKED, "application_locked")
    return updated


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
    user: AuthenticatedUser, expert_id: str, decision: account_status.Decision, notes: str | None
) -> dict:
    # One place per role: an expert is decided here, a dealer in User Management (A3a verification, L5).
    role = await repo.fetch_profile_role(user.access_token, expert_id)
    if role is None:
        raise AppHTTPException(404, "No such account", "not_found")
    if role != "expert":
        raise AppHTTPException(409, "Only an expert is decided here; dealers are reviewed in Users", "conflict")
    # The account, the expert's verification and its latest record move together, with the audit row, in one
    # database transaction (decide_account_status); before A3a these were three separate writes.
    result = await account_status.decide(user, expert_id, decision, notes)
    # After the commit: the email reports a decision that has happened (SRDS §9, §11), and the admin is told whether
    # it went out.
    result["email_delivered"] = await notifications.send_application_decision(user, expert_id, role, decision, notes)
    return result


async def fetch_my_documents(user: AuthenticatedUser) -> list[dict]:
    return await documents.list_documents(user.access_token, documents.EXPERT, user.id)


async def add_my_document(
    user: AuthenticatedUser, storage_path: str, file_name: str, required_document_id: str | None
) -> dict:
    if await repo.fetch_own_expert_profile(user.access_token, user.id) is None:
        # Documents hang off the expert's row (expert_documents.expert_id), so the details come first.
        raise AppHTTPException(409, "Fill in your professional details first", "conflict")
    return await documents.register(
        user.access_token, documents.EXPERT, user.id, storage_path, file_name, required_document_id
    )


async def remove_my_document(user: AuthenticatedUser, document_id: str) -> None:
    await documents.remove(user.access_token, documents.EXPERT, user.id, document_id)


async def document_url_for_admin(user: AuthenticatedUser, expert_id: str, document_id: str) -> str:
    """A signed link to one of this expert's documents. The path is looked up from the document's own row (never
    taken from the client), so only a document that belongs to the expert asked about can be opened."""
    return await documents.signed_url(user.access_token, documents.EXPERT, expert_id, document_id)
