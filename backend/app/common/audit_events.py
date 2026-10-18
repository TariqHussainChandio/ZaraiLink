"""Audit event names (SRDS §51, BR-15).

The database is the source of truth: `audit_logs.action` has a foreign key to `audit_event_names(name)`
(migration 20261023080000_admin_moderation.sql), so a name outside that table is refused at insert time.
This Literal mirrors the table so mypy refuses an unknown name before it reaches the database; a new
name needs a migration row first, then an entry here. Finer detail (create/update/delete, the old
ad-hoc name) goes in the entry's metadata as {"change": ...}, the same convention the migration used
when it renamed historic rows.
"""

from typing import Literal

AuditEvent = Literal[
    "dealer_application_approved",
    "dealer_application_rejected",
    "expert_application_approved",
    "expert_application_rejected",
    "user_suspended",
    "user_reactivated",
    "user_role_changed",
    "product_moderated",
    "review_moderated",
    "order_administrative_action",
    "ai_configuration_changed",
    "report_resolved",
    "report_dismissed",
    "report_updated",
    "message_redacted",
    "category_changed",
    "reference_data_changed",
    "required_document_changed",
    "admin_email_changed",
    "consultation_moderated",
    # Not an admin action: the profile repository writes it with the service role on self-deletion.
    "account_self_deleted",
]
