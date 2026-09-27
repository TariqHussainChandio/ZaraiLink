from ..core.rows import as_rows
from ..core.supabase_client import get_user_scoped_client


async def fetch_own_listings(access_token: str, owner_id: str) -> list[dict]:
    """The caller's listings as id + status: the ids feed view counts, the statuses feed the dashboard's active count."""
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").select("id,status").eq("owner_id", owner_id).execute()
    return as_rows(response)


async def fetch_dealer_sale_transactions(access_token: str, dealer_id: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await (
        client.table("inventory_transactions")
        .select("quantity,created_at,inventory:inventory!inner(dealer_id)")
        .eq("inventory.dealer_id", dealer_id)
        .eq("type", "sale")
        .execute()
    )
    return as_rows(response)


# --- admin-wide reads — every table below already grants admins full read under RLS
# (`... or public.is_admin()`), confirmed directly in the migrations, same as fetch_platform_stats.


async def fetch_all_profiles_summary(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("profiles").select("role,created_at").execute()
    return as_rows(response)


async def fetch_all_listings_status(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").select("status").execute()
    return as_rows(response)


async def fetch_all_orders_summary(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("orders").select("status,total,created_at").execute()
    return as_rows(response)


async def fetch_all_payments_summary(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("payments").select("status,amount").execute()
    return as_rows(response)


async def fetch_all_reports_status(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("reports").select("status").execute()
    return as_rows(response)


async def fetch_all_experts_status(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("experts").select("verification_status").execute()
    return as_rows(response)


async def fetch_all_consultations_status(access_token: str) -> list[dict]:
    client = await get_user_scoped_client(access_token)
    response = await client.table("consultations").select("status").execute()
    return as_rows(response)
