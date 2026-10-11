from app.common.rows import as_rows
from app.database.supabase_client import get_user_scoped_client


async def fetch_own_listings(access_token: str, owner_id: str) -> list[dict]:
    """The caller's listings as id + status: the ids feed view counts, the statuses feed the dashboard's active count."""
    client = await get_user_scoped_client(access_token)
    response = await client.table("listings").select("id,status").eq("owner_id", owner_id).execute()
    return as_rows(response)


# --- admin-wide reads. Each of the seven tables read below (profiles, listings, orders, payments, reports, experts,
# consultations) has a select policy with an `or public.is_admin()` branch, so the admin's own token reads them all.
# That is not true of every table: the dealer's inventory (the IMS tables) gives admins no read at all (BR-03/04), so
# no admin analytics may be built on it.


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
