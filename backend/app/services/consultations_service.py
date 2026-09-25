from fastapi import HTTPException

from ..core.auth import AuthenticatedUser
from ..core.errors import AppHTTPException
from ..repositories import consultations_repository as repo
from ..repositories import expert_repository

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
    if await expert_repository.fetch_expert_by_id(fields["expert_id"]) is None:
        raise HTTPException(status_code=404, detail="Expert not found or not verified")
    return await repo.create_request(user.access_token, user.id, fields)


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
    return consultation


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
