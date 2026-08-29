from typing import Literal

from pydantic import BaseModel

Role = Literal["admin", "expert", "dealer", "farmer", "buyer"]
ReportStatus = Literal["open", "investigating", "resolved", "dismissed"]


class Profile(BaseModel):
    id: str
    role: Role
    full_name: str
    phone: str | None
    avatar_url: str | None
    location: str | None
    country_id: str | None
    province_id: str | None
    city_id: str | None
    village: str | None
    street: str | None
    is_suspended: bool
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
