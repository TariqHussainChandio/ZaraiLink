"""A7 (SRDS §14, §51; BR-15) — every admin write leaves exactly one `audit_logs` row, under its §51 name.

Each case performs the real admin action as a real admin (aal2: every admin write needs a second factor) and then reads
`audit_logs` back with the service role. The assertion is strict: the action adds exactly one row for that target, the
row carries the SRDS §51 event name (`audit_events.py`, held by the `audit_logs.action` foreign key since
20261023080000_admin_moderation.sql), and the actor is the admin who acted. Finer detail (create, update, delete, hide,
restore) goes in `metadata.change`, and is asserted where the route has more than one kind of change.

Since the A7 follow-up the database writes every one of these rows itself, in the same transaction as the change and
with `actor_id = auth.uid()` (20261023080000); the backend writes none. "Exactly one" is what proves the backend's old
call is gone: a second writer would double every row.

The last test ties COVERED to the app: any mutating route an admin can reach (a second-factor route, or a route whose
declared roles include admin) that this file does not cover fails it, so a new admin write cannot ship without either an
audit assertion here or a deliberate entry in NOT_AUDITED with the reason. The independent P5 verification found that
guarding only the second-factor routes let `delete_review` lose its audit call unnoticed; hence the wider guard.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import get_args

import httpx
import pytest
from pydantic import ValidationError
from route_walk import api_routes

from app.common.audit_events import AuditEvent

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")
for _name, _value in (
    ("SUPABASE_URL", LOCAL_URL),
    ("SUPABASE_ANON_KEY", ANON_KEY),
    ("SUPABASE_SERVICE_ROLE_KEY", SERVICE_KEY),
):
    if _value:
        os.environ.setdefault(_name, _value)

try:
    from app.auth.dependencies import declared_roles, require_admin_aal2
    from app.main import app
except ValidationError:
    app = None

# Each route below is exercised by a test in this file that asserts exactly one audit row with its §51 name.
COVERED = {
    ("PATCH", "/api/v1/admin/users/{profile_id}/suspend"),  # user_suspended / user_reactivated
    ("PATCH", "/api/v1/admin/users/{profile_id}/role"),  # user_role_changed
    ("PATCH", "/api/v1/admin/users/{profile_id}/account-status"),  # dealer_application_approved / _rejected
    ("PATCH", "/api/v1/admin/reports/{report_id}/resolve"),  # report_resolved
    ("PATCH", "/api/v1/admin/reports/{report_id}/dismiss"),  # report_dismissed
    ("PATCH", "/api/v1/expert/admin/{expert_id}/verification"),  # expert_application_approved / _rejected
    ("PATCH", "/api/v1/messaging/messages/{message_id}/redact"),  # message_redacted
    ("POST", "/api/v1/reference-data/{table}/rows"),  # reference_data_changed (create)
    ("PATCH", "/api/v1/reference-data/{table}/rows/{row_id}"),  # reference_data_changed (update)
    ("DELETE", "/api/v1/reference-data/{table}/rows/{row_id}"),  # reference_data_changed (delete)
    ("POST", "/api/v1/marketplace/categories"),  # category_changed (create)
    ("PATCH", "/api/v1/marketplace/categories/{category_id}"),  # category_changed (update)
    ("DELETE", "/api/v1/marketplace/categories/{category_id}"),  # category_changed (delete)
    ("PATCH", "/api/v1/marketplace/listings/{listing_id}/status"),  # product_moderated
    ("PATCH", "/api/v1/reviews/{review_id}/hide"),  # review_moderated (hide)
    ("PATCH", "/api/v1/reviews/{review_id}/restore"),  # review_moderated (restore)
    ("POST", "/api/v1/admin/orders/{order_id}/cancel"),  # order_administrative_action (cancel)
    ("PATCH", "/api/v1/admin/consultations/{consultation_id}/moderate"),  # consultation_moderated
    # Audited by the table's own trigger (audit_required_documents), so a Data API write is audited the same way.
    ("POST", "/api/v1/admin/required-documents"),  # required_document_changed (created)
    ("PATCH", "/api/v1/admin/required-documents/{document_id}"),  # required_document_changed (updated)
    # Audited by the table's own trigger (audit_disease_knowledge) as "AI Configuration Changed".
    ("PATCH", "/api/v1/admin/disease-knowledge/{class_label}"),  # ai_configuration_changed (edit)
    ("POST", "/api/v1/admin/disease-knowledge/{class_label}/review"),  # ai_configuration_changed (review)
}
NOT_AUDITED: dict[tuple[str, str], str] = {}


def _service_headers() -> dict[str, str]:
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def _audit_rows(**filters: str) -> list[dict]:
    """Audit rows matching PostgREST filters, read with the service role (the admin's own read is what is under test
    elsewhere; here the question is only what was written)."""
    response = httpx.get(f"{LOCAL_URL}/rest/v1/audit_logs", params=filters, headers=_service_headers(), timeout=30)
    response.raise_for_status()
    return response.json()


def _rows_for_target(target_id: str) -> Callable[[], list[dict]]:
    return lambda: _audit_rows(target_id=f"eq.{target_id}")


def _rows_for_class(class_label: str) -> Callable[[], list[dict]]:
    # A disease knowledge entry is keyed by its text class_label; audit_logs.target_id is a uuid, so the trigger names
    # the class in the row's metadata instead.
    return lambda: _audit_rows(
        **{"target_entity": "eq.disease_knowledge", "metadata->>class_label": f"eq.{class_label}"}
    )


@contextmanager
def _one_audit_row(
    actor_id: str, action: str, rows: Callable[[], list[dict]], change: str | None = None
) -> Iterator[dict]:
    """Asserts that the block adds exactly one audit row for the target, with this §51 name, written as this actor
    (and, when given, this metadata.change). Yields a dict that holds the row afterwards, for further checks."""
    before = {row["id"] for row in rows()}
    found: dict = {}
    yield found
    added = [row for row in rows() if row["id"] not in before]
    assert len(added) == 1, f"expected exactly one audit row, found {len(added)}: {added}"
    row = added[0]
    assert row["action"] == action, f"expected the §51 name {action!r}, the row says {row['action']!r}"
    assert row["actor_id"] == actor_id, f"the row names actor {row['actor_id']}, not the admin {actor_id}"
    if change is not None:
        assert (row.get("metadata") or {}).get("change") == change, row
    found.update(row)


@contextmanager
def _no_audit_row(rows: Callable[[], list[dict]]) -> Iterator[None]:
    before = {row["id"] for row in rows()}
    yield
    added = [row for row in rows() if row["id"] not in before]
    assert added == [], f"a refused or empty action still wrote audit rows: {added}"


def _insert_report(reporter_id: str, reporter_token: str) -> str:
    # As the reporter, through RLS: the service role has no grant on `reports`.
    response = httpx.post(
        f"{LOCAL_URL}/rest/v1/reports",
        json={"reporter_id": reporter_id, "target_type": "user", "target_id": str(uuid.uuid4()), "reason": "smoke"},
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {reporter_token}", "Prefer": "return=representation"},
        timeout=30,
    )
    response.raise_for_status()
    return response.json()[0]["id"]


def _patch(api_client, world, path, **body):
    return api_client("PATCH", path, world.admin.token, json=body or None)


def _order(api_client, world, *moves: tuple[str, str]) -> str:
    """A fresh order for the farmer's listing, moved through `moves`: (actor, status), actor "seller" or "buyer"."""
    checkout = api_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    for actor, to_status in moves:
        token = world.farmer.token if actor == "seller" else world.buyer.token
        moved = api_client("PATCH", f"/api/v1/orders/{order_id}/status", token, json={"to": to_status})
        assert moved.status_code == 204, moved.text
    return order_id


TO_COMPLETED = (
    ("seller", "confirmed"),
    ("seller", "processing"),
    ("seller", "ready"),
    ("seller", "dispatched"),
    ("seller", "completed"),
)


# --- users and applications


def test_suspend_reactivate_and_role_change_are_audited(world, api_client, make_actor):
    target_id = make_actor("buyer")[0]
    path = f"/api/v1/admin/users/{target_id}"
    with _one_audit_row(world.admin.id, "user_suspended", _rows_for_target(target_id)) as row:
        assert _patch(api_client, world, f"{path}/suspend", is_suspended=True).status_code == 204
    assert row["target_entity"] == "profiles"
    assert row["new_state"] == {"is_suspended": True}
    with _one_audit_row(world.admin.id, "user_reactivated", _rows_for_target(target_id)) as row:
        assert _patch(api_client, world, f"{path}/suspend", is_suspended=False).status_code == 204
    assert row["new_state"] == {"is_suspended": False}
    with _one_audit_row(world.admin.id, "user_role_changed", _rows_for_target(target_id)) as row:
        assert _patch(api_client, world, f"{path}/role", role="farmer").status_code == 204
    # The previous role is read from the database, not taken from the client.
    assert row["previous_state"] == {"role": "buyer"}
    assert row["new_state"] == {"role": "farmer"}


def test_dealer_application_decisions_are_audited(world, api_client, make_applicant):
    approved_id = make_applicant("dealer")[0]
    with _one_audit_row(world.admin.id, "dealer_application_approved", _rows_for_target(approved_id)):
        decided = _patch(api_client, world, f"/api/v1/admin/users/{approved_id}/account-status", status="approved")
        assert decided.status_code == 200, decided.text
    rejected_id = make_applicant("dealer")[0]
    with _one_audit_row(world.admin.id, "dealer_application_rejected", _rows_for_target(rejected_id)):
        decided = _patch(
            api_client,
            world,
            f"/api/v1/admin/users/{rejected_id}/account-status",
            status="rejected",
            reason="The licence is unreadable",
        )
        assert decided.status_code == 200, decided.text


def test_expert_verification_decisions_are_audited(world, api_client, make_applicant):
    # The audit row is written by decide_account_status() in the decision's own transaction.
    approved_id = make_applicant("expert")[0]
    with _one_audit_row(world.admin.id, "expert_application_approved", _rows_for_target(approved_id)):
        verified = _patch(api_client, world, f"/api/v1/expert/admin/{approved_id}/verification", decision="approved")
        assert verified.status_code == 200, verified.text
    rejected_id = make_applicant("expert")[0]
    with _one_audit_row(world.admin.id, "expert_application_rejected", _rows_for_target(rejected_id)):
        refused = _patch(
            api_client,
            world,
            f"/api/v1/expert/admin/{rejected_id}/verification",
            decision="rejected",
            notes="The degree certificate does not match the name",
        )
        assert refused.status_code == 200, refused.text


# --- reports and messages


def test_resolving_and_dismissing_a_report_are_audited(world, api_client):
    resolved = _insert_report(world.buyer.id, world.buyer.token)
    dismissed = _insert_report(world.buyer.id, world.buyer.token)
    with _one_audit_row(world.admin.id, "report_resolved", _rows_for_target(resolved)) as row:
        assert _patch(api_client, world, f"/api/v1/admin/reports/{resolved}/resolve", notes="ok").status_code == 204
    # The database's row carries the columns that changed, before and after.
    assert row["target_entity"] == "reports"
    assert row["previous_state"]["status"] == "open"
    assert row["new_state"]["status"] == "resolved"
    assert row["new_state"]["resolved_by"] == world.admin.id
    assert row["new_state"]["resolution_notes"] == "ok"
    with _one_audit_row(world.admin.id, "report_dismissed", _rows_for_target(dismissed)) as row:
        assert _patch(api_client, world, f"/api/v1/admin/reports/{dismissed}/dismiss", notes="no").status_code == 204
    assert row["new_state"]["status"] == "dismissed"
    assert row["new_state"]["resolution_notes"] == "no"


def test_redacting_a_message_is_audited(world, api_client, make_actor):
    # Since A5 a conversation needs a context (SRDS §30): a fresh buyer asks the farmer about their listing.
    asker_token = make_actor("buyer")[2]
    conversation = api_client(
        "POST",
        "/api/v1/messaging/conversations",
        asker_token,
        json={"other_user_id": world.farmer.id, "context_type": "listing", "context_id": world.farmer_listing_id},
    )
    assert conversation.status_code == 200, conversation.text
    sent = api_client(
        "POST",
        f"/api/v1/messaging/conversations/{conversation.json()['id']}/messages",
        asker_token,
        json={"body": "audit me"},
    )
    message_id = sent.json()["id"]
    with _one_audit_row(world.admin.id, "message_redacted", _rows_for_target(message_id)):
        assert _patch(api_client, world, f"/api/v1/messaging/messages/{message_id}/redact").status_code == 204


# --- reference data, categories, listings, required documents


def test_reference_data_writes_are_audited(world, api_client):
    row = {"code": f"aud-{uuid.uuid4().hex[:6]}", "label": "Audit"}
    created = api_client("POST", "/api/v1/reference-data/units/rows", world.admin.token, json=row)
    assert created.status_code == 201, created.text
    row_id = created.json()["id"]
    # The create's row is checked after the fact: its target id only exists once the row does.
    rows = _audit_rows(target_id=f"eq.{row_id}")
    assert [(r["action"], r["actor_id"], r["metadata"]["change"]) for r in rows] == [
        ("reference_data_changed", world.admin.id, "create")
    ]
    path = f"/api/v1/reference-data/units/rows/{row_id}"
    with _one_audit_row(world.admin.id, "reference_data_changed", _rows_for_target(row_id), change="update"):
        assert _patch(api_client, world, path, label="Audit 2").status_code == 204
    with _one_audit_row(world.admin.id, "reference_data_changed", _rows_for_target(row_id), change="delete"):
        assert api_client("DELETE", path, world.admin.token).status_code == 204


def test_category_writes_and_listing_moderation_are_audited(world, api_client):
    slug = f"aud-{uuid.uuid4().hex[:8]}"
    created = api_client(
        "POST", "/api/v1/marketplace/categories", world.admin.token, json={"name": "Audit", "slug": slug}
    )
    assert created.status_code in (200, 201), created.text
    category_id = created.json()["id"]
    rows = _audit_rows(target_id=f"eq.{category_id}")
    assert [(r["action"], r["actor_id"], r["metadata"]["change"]) for r in rows] == [
        ("category_changed", world.admin.id, "create")
    ]
    path = f"/api/v1/marketplace/categories/{category_id}"
    with _one_audit_row(world.admin.id, "category_changed", _rows_for_target(category_id), change="update"):
        assert _patch(api_client, world, path, name="Audit 2").status_code in (200, 204)
    with _one_audit_row(world.admin.id, "category_changed", _rows_for_target(category_id), change="delete"):
        deleted = api_client("DELETE", path, world.admin.token)
        assert deleted.status_code == 204, deleted.text

    # A real change each time: the database writes no row for a write that changes nothing (A7 re-verification G4),
    # and the shared listing is already active.
    listing = world.farmer_listing_id
    for to, was in (("inactive", "active"), ("active", "inactive")):
        with _one_audit_row(world.admin.id, "product_moderated", _rows_for_target(listing)) as row:
            status = _patch(api_client, world, f"/api/v1/marketplace/listings/{listing}/status", status=to)
            assert status.status_code == 204, status.text
        assert row["previous_state"] == {"status": was}
        assert row["new_state"] == {"status": to}


def test_required_document_writes_are_audited_by_their_trigger(world, api_client):
    """An optional document, retired at once, so the applicants other tests create are asked for nothing new."""
    code = f"aud_{uuid.uuid4().hex[:8]}"
    created = api_client(
        "POST",
        "/api/v1/admin/required-documents",
        world.admin.token,
        json={"role": "dealer", "code": code, "label": "Audit document", "is_required": False},
    )
    assert created.status_code == 201, created.text
    document_id = created.json()["id"]
    rows = _audit_rows(target_id=f"eq.{document_id}")
    assert [(r["action"], r["actor_id"], r["metadata"]["change"]) for r in rows] == [
        ("required_document_changed", world.admin.id, "required_document_created")
    ]
    with _one_audit_row(
        world.admin.id, "required_document_changed", _rows_for_target(document_id), change="required_document_updated"
    ):
        retired = _patch(api_client, world, f"/api/v1/admin/required-documents/{document_id}", active=False)
        assert retired.status_code == 200, retired.text


# --- reviews: hidden with a reason and restored, never deleted


def test_hiding_and_restoring_a_review_are_audited_and_a_review_cannot_be_deleted(world, api_client):
    order_id = _order(api_client, world, *TO_COMPLETED)
    review = api_client(
        "POST", "/api/v1/reviews", world.buyer.token, json={"order_id": order_id, "rating": 4, "comment": "audit"}
    )
    assert review.status_code in (200, 201), review.text
    review_id = review.json()["id"]

    # The delete route is gone (A7 decision): the method is not allowed, the review stays, nothing is audited.
    with _no_audit_row(_rows_for_target(review_id)):
        deleted = api_client("DELETE", f"/api/v1/reviews/{review_id}", world.admin.token)
        assert deleted.status_code == 405, deleted.text
    assert api_client("GET", f"/api/v1/reviews/{review_id}").status_code == 200

    with _one_audit_row(world.admin.id, "review_moderated", _rows_for_target(review_id), change="hide") as row:
        hidden = _patch(api_client, world, f"/api/v1/reviews/{review_id}/hide", reason="Abusive language")
        assert hidden.status_code == 200, hidden.text
    assert row["new_state"]["hidden_reason"] == "Abusive language"
    assert api_client("GET", f"/api/v1/reviews/{review_id}").status_code == 404, "a hidden review is still public"

    with _one_audit_row(world.admin.id, "review_moderated", _rows_for_target(review_id), change="restore"):
        restored = _patch(api_client, world, f"/api/v1/reviews/{review_id}/restore")
        assert restored.status_code == 200, restored.text
    assert api_client("GET", f"/api/v1/reviews/{review_id}").status_code == 200

    # Restoring a visible review changes nothing, so it is refused and leaves no row.
    with _no_audit_row(_rows_for_target(review_id)):
        assert _patch(api_client, world, f"/api/v1/reviews/{review_id}/restore").status_code == 409


# --- orders: the admin settles a dispute and may cancel before dispatch


def test_resolving_a_dispute_is_audited(world, api_client):
    """The order status route is open to participants, so the route-coverage guard below cannot see this admin path."""
    order_id = _order(api_client, world, *TO_COMPLETED, ("buyer", "disputed"))
    with _one_audit_row(
        world.admin.id, "order_administrative_action", _rows_for_target(order_id), change="resolve_dispute"
    ) as row:
        moved = api_client(
            "PATCH",
            f"/api/v1/orders/{order_id}/status",
            world.admin.token,
            json={"to": "refunded", "reason": "Goods arrived damaged"},
        )
        assert moved.status_code == 204, moved.text
    assert row["target_entity"] == "order"
    assert row["previous_state"] == {"status": "disputed"}
    assert row["new_state"] == {"status": "refunded", "admin_action_reason": "Goods arrived damaged"}
    # Settling a dispute without a reason is refused and leaves no row (the reason is what both parties read).
    other = _order(api_client, world, *TO_COMPLETED, ("buyer", "disputed"))
    with _no_audit_row(_rows_for_target(other)):
        bare = api_client("PATCH", f"/api/v1/orders/{other}/status", world.admin.token, json={"to": "refunded"})
        assert bare.status_code == 422, bare.text


def test_an_admin_cancellation_before_dispatch_is_audited_and_after_dispatch_is_refused(world, api_client):
    order_id = _order(api_client, world, ("seller", "confirmed"))
    with _one_audit_row(
        world.admin.id, "order_administrative_action", _rows_for_target(order_id), change="cancel"
    ) as row:
        cancelled = api_client(
            "POST", f"/api/v1/admin/orders/{order_id}/cancel", world.admin.token, json={"reason": "Fraud report"}
        )
        assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert row["target_entity"] == "order"
    assert row["previous_state"] == {"status": "confirmed"}
    assert row["new_state"] == {"status": "cancelled", "admin_action_reason": "Fraud report"}

    dispatched = _order(api_client, world, *TO_COMPLETED[:4])
    with _no_audit_row(_rows_for_target(dispatched)):
        refused = api_client(
            "POST", f"/api/v1/admin/orders/{dispatched}/cancel", world.admin.token, json={"reason": "Too late"}
        )
        assert refused.status_code == 422, refused.text


# --- consultations


def _consultation(api_client, world) -> str:
    created = api_client(
        "POST",
        "/api/v1/consultations",
        world.farmer.token,
        json={
            "expert_id": world.expert.id,
            "subject": "Audit consultation",
            "crop_id": None,
            "problem_description": "leaves turning yellow",
            "priority": "medium",
        },
    )
    assert created.status_code in (200, 201), created.text
    return created.json()["id"]


def test_moderating_a_consultation_is_audited(world, api_client):
    for action, status in (("close", "closed"), ("cancel", "cancelled")):
        consultation_id = _consultation(api_client, world)
        path = f"/api/v1/admin/consultations/{consultation_id}/moderate"
        with _one_audit_row(
            world.admin.id, "consultation_moderated", _rows_for_target(consultation_id), change=action
        ) as row:
            moderated = _patch(api_client, world, path, action=action, reason="Duplicate request")
            assert moderated.status_code == 200, moderated.text
        assert moderated.json()["status"] == status
        assert row["previous_state"]["status"] == "requested"
        assert row["new_state"] == {"status": status, "moderation_reason": "Duplicate request"}
        # A closed or cancelled consultation is no longer open: a second moderation is refused and leaves no row.
        with _no_audit_row(_rows_for_target(consultation_id)):
            assert _patch(api_client, world, path, action="close", reason="again").status_code == 422


# --- the disease knowledge base (A6)


def test_disease_knowledge_edit_and_review_are_audited(world, api_client):
    """Review signs the entry off as this admin; an edit sends it back to review. Each leaves one
    "ai_configuration_changed" row. The entry's own text is put back, so other tests reading reports see no change."""
    entries = api_client("GET", "/api/v1/admin/disease-knowledge", world.admin.token)
    assert entries.status_code == 200, entries.text
    entry = entries.json()[0]
    label = entry["class_label"]
    path = f"/api/v1/admin/disease-knowledge/{label}"
    rows = _rows_for_class(label)

    with _one_audit_row(world.admin.id, "ai_configuration_changed", rows, change="review"):
        reviewed = api_client("POST", f"{path}/review", world.admin.token)
        assert reviewed.status_code == 200, reviewed.text
    assert reviewed.json()["review_status"] == "reviewed"
    assert reviewed.json()["reviewed_by"] == world.admin.id

    with _one_audit_row(world.admin.id, "ai_configuration_changed", rows, change="edit"):
        edited = _patch(api_client, world, path, advisory=entry["advisory"] + " (edited)")
        assert edited.status_code == 200, edited.text
    assert edited.json()["review_status"] == "pending_review"
    assert edited.json()["reviewed_by"] is None
    with _one_audit_row(world.admin.id, "ai_configuration_changed", rows, change="edit"):
        restored = _patch(api_client, world, path, advisory=entry["advisory"])
        assert restored.status_code == 200, restored.text
    if entry["review_status"] == "reviewed":
        assert api_client("POST", f"{path}/review", world.admin.token).status_code == 200


# --- the admin reads the log back, with the §51 labels


def test_the_admin_reads_the_log_back_filtered_by_a_section_51_name(world, api_client, make_actor):
    target_id = make_actor("buyer")[0]
    assert _patch(api_client, world, f"/api/v1/admin/users/{target_id}/suspend", is_suspended=True).status_code == 204
    logs = api_client(
        "GET", "/api/v1/admin/audit-logs?action=user_suspended&target_entity=profiles&limit=100", world.admin.token
    )
    assert logs.status_code == 200, logs.text
    assert logs.json(), "the filtered log is empty"
    assert {row["action"] for row in logs.json()} == {"user_suspended"}
    mine = [row for row in logs.json() if row["target_id"] == target_id]
    assert len(mine) == 1
    assert mine[0]["action_label"] == "User Suspended"
    assert mine[0]["actor"]["id"] == world.admin.id

    names = api_client("GET", "/api/v1/admin/audit-events", world.admin.token)
    assert names.status_code == 200, names.text
    vocabulary = {row["name"]: row["label"] for row in names.json()}
    for name in ("user_suspended", "review_moderated", "order_administrative_action", "consultation_moderated"):
        assert name in vocabulary, f"{name} is missing from the §51 vocabulary"
    # The API's filter vocabulary (the AuditEvent literal) is exactly the database's audit_event_names (21 names on a
    # database built from the migrations, report_updated included).
    assert set(get_args(AuditEvent)) == set(vocabulary), set(get_args(AuditEvent)) ^ set(vocabulary)
    assert "report_updated" in vocabulary
    # A name outside §51 (made up, or the pre-§51 name the migration renamed) is refused, not an empty page.
    for name in ("made_up", "suspend_user"):
        refused = api_client("GET", f"/api/v1/admin/audit-logs?action={name}", world.admin.token)
        assert refused.status_code == 422, refused.text


# --- the guard: every admin-reachable write is listed above


def _walk(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _walk(sub)


def _admin_reachable(route) -> bool:
    calls = list(_walk(route.dependant))
    return require_admin_aal2 in calls or any("admin" in declared_roles.get(call, ()) for call in calls)


def test_every_admin_write_route_is_covered_or_explicitly_not_audited():
    if app is None:
        pytest.skip("no Supabase settings in this environment")
    actual = {
        (method, route.path)
        for route in api_routes(app)
        if _admin_reachable(route)
        for method in route.methods - {"GET"}
    }
    # Routes that admins can call as one of several roles (a seller editing their own listing) are audited
    # only when the admin path differs; list those with the reason in NOT_AUDITED rather than skipping them.
    assert actual == COVERED | set(NOT_AUDITED), (
        f"admin-reachable writes without an audit assertion: {sorted(actual - COVERED - set(NOT_AUDITED))}; "
        f"listed but no longer admin-reachable: {sorted((COVERED | set(NOT_AUDITED)) - actual)}"
    )
