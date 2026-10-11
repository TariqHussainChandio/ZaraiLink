import logging
from datetime import UTC, datetime, timedelta

import httpx
from fastapi import HTTPException
from postgrest.exceptions import APIError
from pydantic import ValidationError
from storage3.utils import StorageException

from app.ai import service as ai_service
from app.ai.schemas import DiseaseReport
from app.auth.dependencies import AuthenticatedUser
from app.common.audit_log import log_admin_action
from app.common.consultations import repository as repo
from app.common.errors import AppHTTPException
from app.expert import service as expert_service

logger = logging.getLogger(__name__)

# requested -> accepted/rejected/cancelled; accepted -> in_progress/cancelled; in_progress ->
# resolved; resolved -> closed. `expired` has no in-edge yet (nothing sets it — schema-ready,
# dormant, matching the original frontend comment).
ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "requested": ["accepted", "rejected", "cancelled"],
    "accepted": ["in_progress", "cancelled"],
    "in_progress": ["resolved"],
    "resolved": ["closed"],
    "closed": [],
    "rejected": [],
    "cancelled": [],
    "expired": [],
}

# The old RLS policy only checks "is a participant" (requester OR expert), not which specific
# transitions each side may make — that distinction lived only in the UI (which buttons render).
# A raw API call could previously have let a requester "accept" their own consultation. Every
# transition below is mapped to exactly one allowed actor; anything not listed here is denied,
# not silently allowed, if ALLOWED_TRANSITIONS ever changes without this map being updated too.
TRANSITION_ACTOR: dict[tuple[str, str], str] = {
    ("requested", "accepted"): "expert",
    ("requested", "rejected"): "expert",
    ("requested", "cancelled"): "requester",
    ("accepted", "in_progress"): "expert",
    ("accepted", "cancelled"): "requester",
    ("in_progress", "resolved"): "expert",
    ("resolved", "closed"): "requester",
}


async def create_request(user: AuthenticatedUser, fields: dict) -> dict:
    # Only a verified expert can be asked. The public read below shows `approved` experts only (row-level security),
    # so a pending, rejected or suspended expert, or an id that is not an expert at all, is refused here rather than
    # only being left out of the app's expert list.
    if await expert_service.find_expert(fields["expert_id"]) is None:
        raise HTTPException(status_code=404, detail="Expert not found or not verified")
    try:
        return await repo.create_request(user.access_token, user.id, fields)
    except APIError as exc:
        # The insert guard (20261022080000_ai_advisory.sql) refuses a disease case that is not the requester's own as a
        # 42501, so a farmer can never show an expert someone else's photo and report (SRDS §34).
        if exc.code == "42501" and fields.get("disease_case_id"):
            raise HTTPException(
                status_code=403, detail="A consultation can only refer to your own disease case"
            ) from exc
        raise


async def update_images(user: AuthenticatedUser, consultation_id: str, images: list[str]) -> None:
    await repo.update_images(user.access_token, consultation_id, images)


async def fetch_for_user(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_for_user(user.access_token, user.id)


async def fetch_for_expert(user: AuthenticatedUser) -> list[dict]:
    return await repo.fetch_for_expert(user.access_token, user.id)


async def fetch_by_id(user: AuthenticatedUser, consultation_id: str) -> dict:
    consultation = await repo.get_by_id(user.access_token, consultation_id)
    if consultation is None:
        raise HTTPException(status_code=404, detail="Consultation not found")
    case_id = consultation.get("disease_case_id")
    consultation["ai_report"] = await _ai_case_summary(user, case_id) if case_id else None
    return consultation


async def _ai_case_summary(user: AuthenticatedUser, case_id: str) -> dict | None:
    """The attached AI result for the expert to review (SRDS §34-§35), read with the caller's own token so the
    database decides whether this caller may see the case.

    Any failure gives None: the AI side (model, storage signing, a malformed report) must never break a consultation
    (SRDS §53.39), so the expert still sees the farmer's question and photos without the advisory report."""
    try:
        case = await ai_service.fetch_case_report(user.access_token, case_id)
        if case is None or not case.get("report"):
            return None
        report = DiseaseReport.model_validate(case["report"])
        return {"case_id": case_id, "image_url": case.get("image_signed_url"), "report": report.model_dump()}
    # The faults the AI side can raise: the database read (APIError), photo signing (StorageException, or the
    # HTTPException 500 for a link storage would not sign), the network (httpx.HTTPError) and a malformed report
    # (ValidationError, KeyError, TypeError, ValueError). Each one degrades to "no report", as the docstring says.
    except (
        APIError,
        StorageException,
        HTTPException,
        httpx.HTTPError,
        ValidationError,
        KeyError,
        TypeError,
        ValueError,
    ) as exc:
        logger.warning("consultation AI report unavailable for case %s (%s)", case_id, type(exc).__name__)
        return None


async def update_status(user: AuthenticatedUser, consultation_id: str, to: str) -> None:
    consultation = await repo.get_by_id(user.access_token, consultation_id)
    if consultation is None:
        raise HTTPException(status_code=404, detail="Consultation not found")

    from_status = consultation["status"]
    if to not in ALLOWED_TRANSITIONS.get(from_status, []):
        raise AppHTTPException(422, f'Cannot move a consultation from "{from_status}" to "{to}"', "invalid_transition")

    required_actor = TRANSITION_ACTOR.get((from_status, to))
    is_requester = consultation["user_id"] == user.id
    is_expert = consultation["expert_id"] == user.id

    if required_actor == "expert" and not is_expert:
        raise HTTPException(status_code=403, detail="Only the assigned expert may make this change")
    if required_actor == "requester" and not is_requester:
        raise HTTPException(status_code=403, detail="Only the requester may make this change")
    if required_actor is None:
        # A transition exists in ALLOWED_TRANSITIONS with no actor mapped — default-deny.
        raise HTTPException(status_code=403, detail="This transition is not permitted")

    await repo.update_status(user.access_token, consultation_id, to)


async def fetch_messages(user: AuthenticatedUser, consultation_id: str) -> list[dict]:
    return await repo.fetch_messages(user.access_token, consultation_id)


async def send_message(
    user: AuthenticatedUser,
    consultation_id: str,
    body: str,
    attachments: list[str],
    recommended_listing_id: str | None,
) -> dict:
    return await repo.send_message(
        user.access_token, consultation_id, user.id, body, attachments, recommended_listing_id
    )


async def create_assessment(user: AuthenticatedUser, consultation_id: str, fields: dict) -> dict:
    # The Expert Assessment (SRDS §36, BR-13) is its own append-only record, never an edit of the AI report, so the
    # farmer always sees which advice is the model's and which is the expert's. Row-level security decides who may
    # write it; this layer only turns the database's refusals into answers the app can show.
    try:
        return await repo.create_assessment(user.access_token, consultation_id, user.id, fields)
    except APIError as exc:
        if exc.code == "42501":
            raise HTTPException(
                status_code=403, detail="Only the assigned expert can assess an accepted or in-progress consultation"
            ) from exc
        if exc.code == "23514":
            raise HTTPException(
                status_code=422, detail="A correction or an additional diagnosis must name the diagnosis"
            ) from exc
        raise


async def fetch_assessments(user: AuthenticatedUser, consultation_id: str) -> list[dict]:
    return await repo.fetch_assessments(user.access_token, consultation_id)


# --- admin moderation (SRDS §14, §51; BR-15). The admin sees every consultation and may close or cancel one that is
# still open, with a reason the participants can read. The database trigger decides which moves are allowed; this layer
# turns its refusals into answers and writes the audit entry the admin cannot skip.

MODERATION_STATUS: dict[str, str] = {"close": "closed", "cancel": "cancelled"}


async def fetch_for_admin(user: AuthenticatedUser, status: str | None, older_than_days: int | None) -> list[dict]:
    # "Older than N days" finds the consultations left waiting, the ones an admin most often has to close.
    created_before = (
        (datetime.now(UTC) - timedelta(days=older_than_days)).isoformat() if older_than_days is not None else None
    )
    return await repo.fetch_for_admin(user.access_token, status, created_before)


async def moderate(user: AuthenticatedUser, consultation_id: str, action: str, reason: str) -> dict:
    previous = await repo.get_by_id(user.access_token, consultation_id)
    if previous is None:
        raise HTTPException(status_code=404, detail="Consultation not found")
    try:
        await repo.moderate(user.access_token, consultation_id, MODERATION_STATUS[action], reason)
    except APIError as exc:
        # 23514: no reason, or the consultation is no longer open (already closed, cancelled, rejected or expired).
        if exc.code == "23514":
            detail = exc.message or "This consultation cannot be moderated"
            raise AppHTTPException(422, detail, "invalid_transition") from exc
        if exc.code == "42501":
            raise HTTPException(status_code=403, detail="Only an admin can moderate a consultation") from exc
        raise
    updated = await fetch_by_id(user, consultation_id)
    await log_admin_action(
        user,
        "consultation_moderated",
        "consultations",
        consultation_id,
        previous_state={"status": previous["status"], "moderation_reason": previous.get("moderation_reason")},
        new_state={"status": updated["status"], "moderation_reason": updated.get("moderation_reason")},
        metadata={"change": action},
    )
    return updated
