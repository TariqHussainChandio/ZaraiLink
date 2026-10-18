from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.common.audit_events import AuditEvent

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


# The audit filter accepts only an SRDS §51 event name (BR-15): the AuditEvent literal, which mirrors the
# audit_event_names rows the migrations insert. A made-up name is a 422 instead of a silent empty page that reads as
# "nothing happened". A historic row under an unmapped pre-§51 name (20261023080000_admin_moderation.sql) stays in the
# unfiltered log; it is not offered as a filter.
AuditEventName = AuditEvent


class AuditEventNameEntry(BaseModel):
    """One audit event name and the label the audit screen shows for it (SRDS §51)."""

    name: str
    label: str


class AuditLogEntryWithActor(BaseModel):
    id: str
    actor_id: str | None
    action: str
    # The §51 label of `action`, from audit_event_names, so the app shows the database's own words (BR-15).
    action_label: str
    target_entity: str
    target_id: str | None
    previous_state: dict | None
    new_state: dict | None
    metadata: dict | None
    created_at: str
    actor: ActorRef | None = None


class AdminQueues(BaseModel):
    """What waits for the admin (SRDS §14), from admin_queue_counts(): submitted dealer and expert applications, open or
    investigating reports, disputed orders, and consultations open for over a week without an outcome."""

    pending_dealer_applications: int
    pending_expert_applications: int
    open_reports: int
    disputed_orders: int
    stale_consultations: int


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


class RequiredDocumentInput(BaseModel):
    """A new document applicants of a role are asked for (SRDS §7: configurable). `code` is a stable machine name."""

    role: Literal["dealer", "expert"]
    code: str = Field(pattern=r"^[a-z][a-z0-9_]{1,49}$")
    label: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    is_required: bool = True
    sort_order: int = 0


class RequiredDocumentUpdate(BaseModel):
    """A change to one entry. It is never deleted, only retired (`active: false`): sent documents point at it."""

    label: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    is_required: bool | None = None
    active: bool | None = None
    sort_order: int | None = None


# --- AI activity and the disease knowledge base (A6; SRDS §37)


class AiActivityDay(BaseModel):
    """One UTC day of the activity window."""

    date: str  # ISO date, YYYY-MM-DD
    scans: int
    failed: int
    low_confidence: int
    referrals: int


class AiActivity(BaseModel):
    """The AI module at a glance for the last `window_days` days (SRDS §37). Counts only; no image, no farmer."""

    window_days: int
    since: str
    scans: int
    failed: int
    predicted: int
    # A predicted scan whose confidence is under LOW_CONFIDENCE_THRESHOLD: the report tells the farmer to ask an expert.
    low_confidence: int
    # low_confidence / predicted, 0.0 when nothing was predicted.
    low_confidence_share: float
    # Consultations opened from a scan (consultations.disease_case_id set): AI results routed to an expert (BR-13).
    referrals: int
    days: list[AiActivityDay]


class DiseaseKnowledgeEntry(BaseModel):
    class_label: str
    crop: str
    disease: str
    is_healthy: bool
    symptoms: list[str]
    treatment: list[str]
    precautions: list[str]
    advisory: str
    review_status: Literal["pending_review", "reviewed"]
    reviewed_by: str | None
    reviewed_at: str | None
    updated_at: str


class DiseaseKnowledgeUpdate(BaseModel):
    """An admin's edit of one entry. class_label is the model's own label and is_healthy follows from it, so neither
    is editable; review fields change only through the review route."""

    crop: str | None = Field(default=None, min_length=1, max_length=120)
    disease: str | None = Field(default=None, min_length=1, max_length=200)
    symptoms: list[str] | None = Field(default=None, max_length=30)
    treatment: list[str] | None = Field(default=None, max_length=30)
    precautions: list[str] | None = Field(default=None, max_length=30)
    advisory: str | None = Field(default=None, min_length=1, max_length=4000)

    @model_validator(mode="after")
    def _no_blank_text(self) -> "DiseaseKnowledgeUpdate":
        # The table's checks reject a blank crop, disease or advisory; saying so here gives a 422 instead of a 500.
        for name in ("crop", "disease", "advisory"):
            value = getattr(self, name)
            if value is not None and not value.strip():
                raise ValueError(f"{name} cannot be blank")
        for name in ("symptoms", "treatment", "precautions"):
            items = getattr(self, name)
            if items is not None and any(not item.strip() or len(item) > 1000 for item in items):
                raise ValueError(f"every {name} line needs text, up to 1000 characters")
        return self
