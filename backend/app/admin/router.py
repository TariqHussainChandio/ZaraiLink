from fastapi import APIRouter, Depends

from app.admin import service
from app.admin.schemas import (
    AccountStatus,
    AuditLogEntryWithActor,
    DecideAccountRequest,
    PlatformStats,
    Profile,
    ReportWithReporter,
    RequiredDocumentInput,
    RequiredDocumentUpdate,
    ResolveReportRequest,
    Role,
    SuspendUserRequest,
    UpdateUserRoleRequest,
)
from app.auth.dependencies import AuthenticatedUser, require_admin, require_admin_aal2
from app.common.orders.schemas import OrderWithItems
from app.common.pagination import Page, paginate
from app.common.schemas import AccountDecision, RequiredDocument, SignedUrl
from app.dealer.schemas import DealerApplicationForAdmin

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

# Every route in this router is require_admin, no exceptions.


@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(user: AuthenticatedUser = Depends(require_admin)) -> dict:
    return await service.fetch_platform_stats(user)


@router.get("/users", response_model=list[Profile])
async def list_users(
    role: Role | None = None,
    account_status: AccountStatus | None = None,
    user: AuthenticatedUser = Depends(require_admin),
    page: Page = Depends(paginate),
) -> list[dict]:
    return page.finish(await service.fetch_all_profiles(user, role, account_status))


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


@router.patch("/users/{profile_id}/account-status", response_model=AccountDecision)
async def decide_dealer_application(
    profile_id: str, request: DecideAccountRequest, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> dict:
    return await service.decide_dealer_application(user, profile_id, request.status, request.reason)


@router.get("/dealer-applications", response_model=list[DealerApplicationForAdmin])
async def list_dealer_applications(
    status: AccountStatus = "pending", user: AuthenticatedUser = Depends(require_admin), page: Page = Depends(paginate)
) -> list[dict]:
    """The dealer queue (SRDS §12): submitted applications waiting for a decision, oldest first, by default."""
    return page.finish(await service.fetch_dealer_applications(user, status))


@router.get("/dealer-applications/{dealer_id}", response_model=DealerApplicationForAdmin)
async def get_dealer_application(dealer_id: str, user: AuthenticatedUser = Depends(require_admin)) -> dict:
    return await service.fetch_dealer_application(user, dealer_id)


@router.get("/dealer-applications/{dealer_id}/documents/{document_id}/url", response_model=SignedUrl)
async def get_dealer_document_url(
    dealer_id: str, document_id: str, user: AuthenticatedUser = Depends(require_admin)
) -> SignedUrl:
    """A ten-minute link to one of the dealer's documents, so the admin inspects it before deciding (SRDS §12)."""
    return SignedUrl(url=await service.dealer_document_url(user, dealer_id, document_id))


@router.get("/required-documents", response_model=list[RequiredDocument])
async def list_required_documents(user: AuthenticatedUser = Depends(require_admin)) -> list[dict]:
    return await service.fetch_required_documents(user)


@router.post("/required-documents", response_model=RequiredDocument, status_code=201)
async def create_required_document(
    request: RequiredDocumentInput, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> dict:
    return await service.create_required_document(user, request.model_dump())


@router.patch("/required-documents/{document_id}", response_model=RequiredDocument)
async def update_required_document(
    document_id: str, request: RequiredDocumentUpdate, user: AuthenticatedUser = Depends(require_admin_aal2)
) -> dict:
    return await service.update_required_document(user, document_id, request.model_dump(exclude_unset=True))


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
