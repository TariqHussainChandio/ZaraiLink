from ..core.supabase_client import get_user_scoped_client


def fetch_own_listing_ids(access_token: str, owner_id: str) -> list[str]:
    rows = get_user_scoped_client(access_token).table("listings").select("id").eq("owner_id", owner_id).execute().data or []
    return [row["id"] for row in rows]


def fetch_dealer_sale_transactions(access_token: str, dealer_id: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token)
        .table("inventory_transactions")
        .select("quantity,created_at,inventory:inventory!inner(dealer_id)")
        .eq("inventory.dealer_id", dealer_id)
        .eq("type", "sale")
        .execute()
        .data
        or []
    )


# --- admin-wide reads — every table below already grants admins full read under RLS
# (`... or public.is_admin()`), confirmed directly in the migrations, same as fetch_platform_stats.


def fetch_all_profiles_summary(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("profiles").select("role,created_at").execute().data or []


def fetch_all_listings_status(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("listings").select("status").execute().data or []


def fetch_all_orders_summary(access_token: str) -> list[dict]:
    return (
        get_user_scoped_client(access_token).table("orders").select("status,total,created_at").execute().data or []
    )


def fetch_all_payments_summary(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("payments").select("status,amount").execute().data or []


def fetch_all_reports_status(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("reports").select("status").execute().data or []


def fetch_all_experts_status(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("experts").select("verification_status").execute().data or []


def fetch_all_consultations_status(access_token: str) -> list[dict]:
    return get_user_scoped_client(access_token).table("consultations").select("status").execute().data or []
