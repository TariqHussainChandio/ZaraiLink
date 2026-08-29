# Placeholder scaffold — not yet used by any of the existing per-domain repository modules,
# which each call the Supabase client directly. Introduced only to match the target directory
# layout; wiring the existing repositories to inherit from this is a separate, larger change.
from ..core.supabase_client import get_service_role_client, get_user_scoped_client


class BaseRepository:
    """Placeholder base class for future shared repository behavior (not yet implemented)."""

    def __init__(self, table: str) -> None:
        self.table = table

    def service_role_client(self):
        return get_service_role_client()

    def user_scoped_client(self, access_token: str):
        return get_user_scoped_client(access_token)
