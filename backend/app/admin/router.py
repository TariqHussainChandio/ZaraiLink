from fastapi import APIRouter, Depends

from app.admin import service
from app.admin.schemas import (
    AuditLogEntryWithActor,
    PlatformStats,
    Profile,
    ReportWithReporter,
    ResolveReportRequest,
    SuspendUserRequest,
    UpdateUserRoleRequest,
)
from app.auth.dependencies import AuthenticatedUser, require_admin, require_admin_aal2
from app.common.orders.schemas import OrderWithItems
from app.common.pagination import Page, paginate

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Every route in this router is require_admin, no exceptions.


@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(user: AuthenticatedUser = Depends(require_admin)) -> dict:
    return await service.fetch_platform_stats(user)


@router.get("/users", response_model=list[Profile])
async def list_users(user: AuthenticatedUser = Depends(require_admin), page: Page = Depends(paginate)) -> list[dict]:
    return page.finish(await service.fetch_all_profiles(user))


@router.patch("/users/{profile_id}/suspend", status_code=204)
async def suspend_user(
    profile_id: str, request: SuspendUserRequest, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> None:
    await service.set_profile_suspended(user, profile_id, request.is_suspended)


@router.patch("/users/{profile_id}/role", status_code=204)
async def change_user_role(
    profile_id: str, request: UpdateUserRoleRequest, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> None:
    await service.update_user_role(user, profile_id, request.role)


@router.get("/reports", response_model=list[ReportWithReporter])
async def list_reports(
    status: str | None = None, user: AuthenticatedUser = Depends(require_admin), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_reports(user, status))


@router.patch("/reports/{report_id}/resolve", status_code=204)
async def resolve_report(
    report_id: str, request: ResolveReportRequest, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> None:
    await service.resolve_report(user, report_id, request.notes)


@router.patch("/reports/{report_id}/dismiss", status_code=204)
async def dismiss_report(
    report_id: str, request: ResolveReportRequest, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> None:
    await service.dismiss_report(user, report_id, request.notes)


@router.get("/audit-logs", response_model=list[AuditLogEntryWithActor])
async def list_audit_logs(
    target_entity: str | None = None,
    actor_id: str | None = None,
    user: AuthenticatedUser = Depends(require_admin),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_audit_logs(user, target_entity, actor_id))


@router.get("/orders", response_model=list[OrderWithItems])
async def list_all_orders(
    user: AuthenticatedUser = Depends(require_admin), page: Page = Depends(paginate)
) -> list[dict]:
    return page.finish(await service.fetch_all_orders(user))
