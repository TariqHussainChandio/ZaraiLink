from fastapi import HTTPException

from app.auth.dependencies import AuthenticatedUser
from app.common.errors import AppHTTPException
from app.common.profile import repository as repo


async def update_profile(user: AuthenticatedUser, patch: dict) -> None:
    # `role`/`is_suspended` are simply not fields on ProfileUpdateRequest (common/profile/schemas.py) —
    # a self-service profile update has no way to even attempt setting them, on top of
    # `guard_profiles_role`'s own trigger-level block for `role` specifically.
    await repo.update_profile(user.access_token, user.id, patch)


async def delete_own_account(user: AuthenticatedUser, password: str) -> None:
    """P4 (4A.5). Order matters and is deliberate:

    1. Re-authenticate (password confirm) — a stolen, still-valid access token alone is not
       enough to permanently delete an account.
    2. Anonymize the profile row in place (kept, never deleted, so every existing embed on this
       user's historical orders/reviews/messages still resolves).
    3. Delete owned storage objects (avatars, disease-images, expert-documents — see
       profile_repository's own note on the buckets NOT covered by this sweep).
    4. Audit-log the action, before the account that would otherwise be the log's own subject
       stops being able to authenticate.
    5. Soft-delete the auth user last — `should_soft_delete=True` blocks future sign-in without
       physically removing the `auth.users` row, so the `on delete cascade` down to `profiles`
       (and everything cascading from that) never fires. A plain delete here would silently
       destroy everything step 2 just anonymized.

    No email/phone on the account (phone sign-up is still Blocked project-wide) means there is
    no channel to re-authenticate through yet — rejected explicitly rather than silently skipping
    the check.
    """
    if not user.email:
        raise HTTPException(status_code=422, detail="Account deletion needs an email to confirm your password.")
    if not await repo.reauthenticate(user.email, password):
        raise AppHTTPException(401, "Incorrect password.", "incorrect_password")

    await repo.anonymize_profile(user.access_token, user.id)
    await repo.delete_owned_storage_objects(user.id)
    await repo.log_self_deletion(user.id)
    await repo.soft_delete_auth_user(user.id)
