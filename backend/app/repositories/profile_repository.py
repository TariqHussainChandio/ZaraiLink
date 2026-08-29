from typing import Any

from ..core.supabase_client import get_user_scoped_client


def update_profile(access_token: str, user_id: str, patch: dict[str, Any]) -> None:
    get_user_scoped_client(access_token).table("profiles").update(patch).eq("id", user_id).execute()
