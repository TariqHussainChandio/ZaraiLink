from ..core.auth import AuthenticatedUser
from ..repositories import profile_repository as repo


def update_profile(user: AuthenticatedUser, patch: dict) -> None:
    # `role`/`is_suspended` are simply not fields on ProfileUpdateRequest (schemas/profile.py) —
    # a self-service profile update has no way to even attempt setting them, on top of
    # `guard_profiles_role`'s own trigger-level block for `role` specifically.
    repo.update_profile(user.access_token, user.id, patch)
