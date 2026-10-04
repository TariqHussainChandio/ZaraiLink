from typing import Literal

from pydantic import BaseModel, Field, model_validator

Role = Literal["admin", "expert", "dealer", "farmer", "buyer"]
ReportStatus = Literal["open", "investigating", "resolved", "dismissed"]
AccountStatus = Literal["pending", "approved", "rejected"]


class Profile(BaseModel):
    id: str
    role: Role
    full_name: str
    phone: str | None
    avatar_url: str | None
    location: str | None
    country: str | None
    province: str | None
    city: str | None
    village: str | None
    street: str | None
    is_suspended: bool
    account_status: AccountStatus = "approved"
    account_status_reason: str | None = None
    account_status_changed_at: str | None = None
    created_at: str
    updated_at: str


class PlatformStats(BaseModel):
    total_users: int
    users_by_role: dict[str, int]
    total_listings: int
    total_orders: int


class SuspendUserRequest(BaseModel):
    is_suspended: bool


class UpdateUserRoleRequest(BaseModel):
    role: Role


class ReporterRef(BaseModel):
    id: str
    full_name: str


class Report(BaseModel):
    id: str
    reporter_id: str
    target_type: str
    target_id: str
    reason: str
    status: ReportStatus
    resolution_notes: str | None
    resolved_by: str | None
    resolved_at: str | None
    created_at: str


class ReportWithReporter(Report):
    reporter: ReporterRef | None = None


class ResolveReportRequest(BaseModel):
    notes: str | None = None


class ActorRef(BaseModel):
    id: str
    full_name: str


class AuditLogEntryWithActor(BaseModel):
    id: str
    actor_id: str | None
    action: str
    target_entity: str
    target_id: str | None
    previous_state: dict | None
    new_state: dict | None
    metadata: dict | None
    created_at: str
    actor: ActorRef | None = None


class DecideAccountRequest(BaseModel):
    """An admin's decision on a pending dealer (SRDS §8, §12). A rejection carries the reason the applicant will read
    on their Application Status screen, so it must say something (decide_account_status() enforces the same)."""

    status: Literal["approved", "rejected"]
    reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _rejection_has_reason(self) -> "DecideAccountRequest":
        if self.status == "rejected" and len((self.reason or "").strip()) < 10:
            raise ValueError("A rejection needs a reason of at least 10 characters")
        return self


class AccountDecision(BaseModel):
    role: Role
    previous_status: AccountStatus
    new_status: AccountStatus
