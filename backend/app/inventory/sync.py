"""Marketplace synchronisation, the dealer's side (B3; SRDS §19-§21, §53.39). Dispatch applies its events to the IMS in
the dispatch transaction (apply_order_dispatch → apply_dispatch_event); an event the IMS could not apply is logged in
inventory_sync_log and stays pending, never blocking the marketplace. Here the dealer reads that log and retries their
pending events. Reconciliation (§25) lives in reports.py.
"""

from fastapi import APIRouter, Depends

from app.auth.dependencies import AuthenticatedUser, require_dealer
from app.common.pagination import Page, paginate
from app.inventory import repository as repo
from app.inventory.errors import stock_errors
from app.inventory.schemas import RetryResult, SyncLogEntry, SyncStatus

router = APIRouter()


# --- service ----------------------------------------------------------------------------------------------------------


async def list_sync_log(user: AuthenticatedUser, status: str | None = None) -> list[dict]:
    return await repo.fetch_sync_log(user.access_token, status)


async def retry_pending(user: AuthenticatedUser) -> dict:
    """Re-applies the dealer's own pending dispatch events, oldest first. Idempotent: a line already deducted is
    logged `skipped_duplicate` (the unique ledger index on order_item_id, SRDS §21), never deducted twice."""
    with stock_errors():
        applied = await repo.retry_dispatch_events(user.access_token)
    return {"applied": applied}


# --- routes -----------------------------------------------------------------------------------------------------------


@router.get("/sync/log", response_model=list[SyncLogEntry])
async def get_sync_log(
    status: SyncStatus | None = None, user: AuthenticatedUser = Depends(require_dealer), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await list_sync_log(user, status))


@router.post("/sync/retry", response_model=RetryResult)
async def post_sync_retry(user: AuthenticatedUser = Depends(require_dealer)) -> dict:
    return await retry_pending(user)
