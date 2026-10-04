from typing import Any

from postgrest.exceptions import APIError
from supabase import AuthError

from app.common.errors import AppHTTPException
from app.common.rows import as_rows
from app.database.supabase_client import get_reauth_client, get_service_role_client, get_user_scoped_client

# P4 (4A.5), account deletion: buckets whose objects are stored under a `{user_id}/...` prefix,
# so a sweep-by-owner is just a `list(user_id)` + `remove(...)` per bucket. `message-attachments`
# and `consultation-attachments` are deliberately NOT included — their paths are keyed by
# conversation/consultation id, not user id (grep-verified), so finding "this user's" objects
# there needs a join through messages/consultation_messages, not a prefix list. Known gap, not
# silently dropped: see the account-deletion service's own docstring.
_OWNER_PREFIXED_BUCKETS = ("avatars", "disease-images", "expert-documents", "dealer-documents")


async def update_profile(access_token: str, user_id: str, patch: dict[str, Any]) -> None:
    client = await get_user_scoped_client(access_token)
    await client.table("profiles").update(patch).eq("id", user_id).execute()


async def reauthenticate(email: str, password: str) -> bool:
    """Confirms the caller really knows their current password before a destructive action
    (account deletion) — the same idea as Supabase's own `secure_password_change`, done
    explicitly here since that setting only guards Supabase's own password-change call, not this
    backend's account-deletion endpoint. Never raises on a wrong password; returns False."""
    try:
        client = await get_reauth_client()
        await client.auth.sign_in_with_password({"email": email, "password": password})
        return True
    except AuthError:
        return False


async def anonymize_profile(access_token: str, user_id: str) -> None:
    """Scrubs the caller's own PII in place — the row itself is kept (never deleted), so every
    existing embed (`profiles_public`) on their historical orders/reviews/messages automatically
    shows the placeholder from this one update, with no changes needed to those tables."""
    client = await get_user_scoped_client(access_token)
    await (
        client.table("profiles")
        .update({"full_name": "Deleted user", "phone": None, "avatar_url": None, "location": None})
        .eq("id", user_id)
        .execute()
    )


async def delete_owned_storage_objects(user_id: str) -> None:
    """Sweeps the owner-prefixed buckets (see _OWNER_PREFIXED_BUCKETS) for this user's objects.
    Uses the service-role client: by the time this runs, the caller's own profile is already
    anonymized and about to be soft-deleted, so this isn't gated behind the user's own token —
    it's the backend's own cleanup step, the same documented exception every other service-role
    call site in this codebase already follows.

    P5 audit: the owner-scoped storage policies would let the user's own token do this too, so it
    could be converted. Deliberately not: converting buys no security (the caller owns these objects
    either way) and makes this step depend on the token still being valid mid-deletion, with nothing
    to re-authenticate it if it isn't."""
    client = get_service_role_client()
    for bucket in _OWNER_PREFIXED_BUCKETS:
        objects = await client.storage.from_(bucket).list(user_id)
        if not objects:
            continue
        paths = [f"{user_id}/{obj['name']}" for obj in objects]
        await client.storage.from_(bucket).remove(paths)


async def soft_delete_auth_user(user_id: str) -> None:
    """`should_soft_delete=True`: GoTrue marks the auth.users row deleted and blocks future
    sign-in, without physically removing it — so the `on delete cascade` from
    `profiles.id references auth.users(id)` never fires, and the just-anonymized profile row
    (and everything referencing it) survives untouched. A plain delete would cascade-wipe it."""
    await get_service_role_client().auth.admin.delete_user(user_id, should_soft_delete=True)


async def log_self_deletion(user_id: str) -> None:
    """`audit_logs`' insert policy is admin-only (this isn't an admin action), so this one entry
    goes through the service-role client — a narrow, explicit exception matching this codebase's
    existing pattern (see supabase/migrations/*_account_deletion.sql for the matching grant)."""
    await (
        get_service_role_client()
        .table("audit_logs")
        .insert(
            {
                "actor_id": user_id,
                "action": "account_self_deleted",
                "target_entity": "profiles",
                "target_id": user_id,
            }
        )
        .execute()
    )


async def fetch_required_documents(access_token: str, role: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = (
        await client.table("required_documents")
        .select("*")
        .eq("role", role)
        .eq("active", True)
        .order("sort_order")
        .order("label")
        .execute()
    )
    return as_rows(response)


# submit_application() names what is missing in this form (20261012080000_applications.sql).
_MISSING_PREFIX = "The application is missing"


async def submit_application(access_token: str) -> None:
    """submit_application() checks the caller is a dealer or expert with a draft or rejected application that is
    complete, and not suspended (20261012080000_applications.sql). An incomplete one is `application_incomplete` with
    the database's list of what is missing; any other refusal (under review, approved, not an applicant) is
    `invalid_transition`; a suspended account is 403."""
    client = await get_user_scoped_client(access_token)
    try:
        await client.rpc("submit_application", {}).execute()
    except APIError as exc:
        if exc.code == "23514" and (exc.message or "").startswith(_MISSING_PREFIX):
            raise AppHTTPException(409, exc.message or _MISSING_PREFIX, "application_incomplete") from exc
        if exc.code == "23514":
            raise AppHTTPException(
                409, exc.message or "This application cannot be sent now", "invalid_transition"
            ) from exc
        if exc.code == "42501":
            raise AppHTTPException(403, exc.message or "This account cannot send an application", "forbidden") from exc
        raise
