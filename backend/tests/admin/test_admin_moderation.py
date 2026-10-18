"""A7: the admin's moderation surface (SRDS §14, §51; BR-15), at unit level.

Covers the routes that had no unit test: the dashboard queues, the audit log with its §51 labels and filter, the audit
event names, consultation moderation and the order administrative actions. The repositories are patched, so these prove
the gates (admin role, second factor on writes) and what reaches the service. The audit row of every write here is
written by the database in the same transaction (20261023080000), so these assert the service writes none of its own.
The real audit rows are proven on the real stack in tests/integration/smoke/test_smoke_admin_audit.py.
"""

from typing import get_args
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.routing import APIRoute, iter_route_contexts
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.admin import service
from app.auth.dependencies import AuthenticatedUser, get_current_user, require_admin_aal2
from app.common.audit_events import AuditEvent
from app.common.consultations import service as consultations_service
from app.common.errors import AppHTTPException
from app.common.orders import service as orders_service
from app.main import app

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok", aal="aal2")
ADMIN_AAL1 = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok", aal="aal1")
FARMER = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok2", aal="aal2")

QUEUES = {
    "pending_dealer_applications": 2,
    "pending_expert_applications": 1,
    "open_reports": 3,
    "disputed_orders": 1,
    "stale_consultations": 0,
}


@pytest.fixture
def as_user():
    def _set(user: AuthenticatedUser) -> None:
        app.dependency_overrides[get_current_user] = lambda: user

    yield _set
    app.dependency_overrides.pop(get_current_user, None)


def _admin_routes() -> list[tuple[str, str, APIRoute, object]]:
    """Every route under /api/v1/admin, whichever module declares it (the order and consultation actions live in their
    own modules but share the admin prefix), with its effective dependant."""
    routes = []
    for context in iter_route_contexts(app.routes):
        route = context.original_route
        path = context.path or getattr(route, "path", "")
        if isinstance(route, APIRoute) and path.startswith("/api/v1/admin"):
            for method in sorted((context.methods or route.methods) - {"HEAD", "OPTIONS"}):
                routes.append((method, path, route, context.dependant or route.dependant))
    return routes


def _calls(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _calls(sub)


def _concrete(path: str) -> str:
    # Any made-up id: every refusal below happens in a dependency, before the id is looked at.
    return path.replace("{", "").replace("}", "")


# --- gates on the whole admin prefix


def test_the_admin_prefix_holds_the_a7_routes():
    paths = {(method, path) for method, path, _, _ in _admin_routes()}
    for expected in (
        ("GET", "/api/v1/admin/queues"),
        ("GET", "/api/v1/admin/audit-events"),
        ("GET", "/api/v1/admin/consultations"),
        ("GET", "/api/v1/admin/consultations/{consultation_id}"),
        ("PATCH", "/api/v1/admin/consultations/{consultation_id}/moderate"),
        ("POST", "/api/v1/admin/orders/{order_id}/cancel"),
    ):
        assert expected in paths


def test_every_admin_route_rejects_an_unauthenticated_caller():
    for method, path, _, _ in _admin_routes():
        response = client.request(method, _concrete(path), json={} if method != "GET" else None)
        assert response.status_code == 401, f"{method} {path} did not reject an unauthenticated caller"


def test_every_admin_route_rejects_a_non_admin(as_user):
    as_user(FARMER)
    for method, path, _, _ in _admin_routes():
        response = client.request(method, _concrete(path), json={} if method != "GET" else None)
        assert response.status_code == 403, f"{method} {path} let a farmer through: {response.status_code}"
        assert response.json()["code"] == "insufficient_role", f"{method} {path}: {response.text}"


def test_every_admin_write_needs_a_second_factor(as_user):
    """Two users in one: the same admin without a verified second factor is refused on every admin write."""
    as_user(ADMIN_AAL1)
    writes = [(m, p, d) for m, p, _, d in _admin_routes() if m != "GET"]
    assert writes, "no admin writes found"
    for method, path, dependant in writes:
        assert require_admin_aal2 in list(_calls(dependant)), f"{method} {path} does not demand a second factor"
        response = client.request(method, _concrete(path), json={})
        assert response.status_code == 403, f"{method} {path} let an aal1 admin write: {response.status_code}"
        assert response.json()["code"] == "mfa_required", f"{method} {path}: {response.text}"


# --- the dashboard queues


def test_queues_are_an_admin_read_without_a_second_factor(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.admin.router.service.fetch_queue_counts", new=AsyncMock(return_value=QUEUES)) as fetch:
        response = client.get("/api/v1/admin/queues")
    assert response.status_code == 200, response.text
    assert response.json() == QUEUES
    fetch.assert_awaited_once_with(ADMIN_AAL1)


@pytest.mark.asyncio
async def test_queue_counts_are_read_with_the_admins_own_token():
    with patch("app.admin.service.repo.fetch_queue_counts", new=AsyncMock(return_value=QUEUES)) as fetch:
        assert await service.fetch_queue_counts(ADMIN) == QUEUES
    fetch.assert_awaited_once_with(ADMIN.access_token)


# --- the audit log and its §51 vocabulary


NAMES = [
    {"name": "user_suspended", "label": "User Suspended"},
    {"name": "review_moderated", "label": "Review Moderated"},
]


@pytest.mark.asyncio
async def test_each_audit_row_carries_its_section_51_label():
    logs = [
        {"id": "l-1", "action": "user_suspended"},
        {"id": "l-2", "action": "review_moderated"},
        # A row the caller's vocabulary read did not return still shows its name rather than failing the page.
        {"id": "l-3", "action": "legacy_name"},
    ]
    with (
        patch("app.admin.service.repo.fetch_audit_logs", new=AsyncMock(return_value=logs)) as fetch_logs,
        patch("app.admin.service.repo.fetch_audit_event_names", new=AsyncMock(return_value=NAMES)),
    ):
        result = await service.fetch_audit_logs(ADMIN, "profiles", None, "user_suspended")
    fetch_logs.assert_awaited_once_with(ADMIN.access_token, "profiles", None, "user_suspended")
    assert [row["action_label"] for row in result] == ["User Suspended", "Review Moderated", "legacy_name"]


def test_the_audit_log_route_passes_the_action_filter(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.admin.router.service.fetch_audit_logs", new=AsyncMock(return_value=[])) as fetch:
        response = client.get("/api/v1/admin/audit-logs?action=review_moderated&target_entity=reviews")
    assert response.status_code == 200, response.text
    fetch.assert_awaited_once_with(ADMIN_AAL1, "reviews", None, "review_moderated")


def test_the_audit_log_route_refuses_a_malformed_action(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.admin.router.service.fetch_audit_logs", new=AsyncMock(return_value=[])) as fetch:
        response = client.get("/api/v1/admin/audit-logs", params={"action": "User Suspended"})
    assert response.status_code == 422
    fetch.assert_not_awaited()


@pytest.mark.parametrize("name", ["made_up", "suspend_user", "delete_review"])
def test_the_audit_log_route_refuses_a_name_outside_the_section_51_vocabulary(as_user, name):
    """A made-up or pre-§51 name is a 422, not an empty page that would read as "nothing of that kind happened"."""
    as_user(ADMIN_AAL1)
    with patch("app.admin.router.service.fetch_audit_logs", new=AsyncMock(return_value=[])) as fetch:
        response = client.get("/api/v1/admin/audit-logs", params={"action": name})
    assert response.status_code == 422, response.text
    fetch.assert_not_awaited()


def test_every_section_51_name_is_accepted_by_the_audit_log_filter(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.admin.router.service.fetch_audit_logs", new=AsyncMock(return_value=[])):
        for name in get_args(AuditEvent):
            assert client.get("/api/v1/admin/audit-logs", params={"action": name}).status_code == 200, name


def test_the_audit_event_names_are_an_admin_read(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.admin.service.repo.fetch_audit_event_names", new=AsyncMock(return_value=NAMES)) as fetch:
        response = client.get("/api/v1/admin/audit-events")
    assert response.status_code == 200, response.text
    assert response.json() == NAMES
    fetch.assert_awaited_once_with(ADMIN_AAL1.access_token)


# --- consultation moderation (SRDS §14)

CONSULTATION = {"id": "c-1", "status": "requested", "moderation_reason": None, "disease_case_id": None}


def test_the_consultation_list_passes_its_filters(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.common.consultations.router.service.fetch_for_admin", new=AsyncMock(return_value=[])) as fetch:
        response = client.get("/api/v1/admin/consultations?status=requested&older_than_days=7")
    assert response.status_code == 200, response.text
    fetch.assert_awaited_once_with(ADMIN_AAL1, "requested", 7)


def test_moderating_a_consultation_needs_a_known_action_and_a_reason(as_user):
    as_user(ADMIN)
    with patch("app.common.consultations.router.service.moderate", new=AsyncMock()) as moderate:
        assert (
            client.patch(
                "/api/v1/admin/consultations/c-1/moderate", json={"action": "delete", "reason": "x"}
            ).status_code
            == 422
        )
        assert client.patch("/api/v1/admin/consultations/c-1/moderate", json={"action": "close"}).status_code == 422
    moderate.assert_not_awaited()


@pytest.mark.asyncio
async def test_moderating_a_consultation_writes_the_status_and_reason_and_leaves_the_audit_to_the_database():
    closed = {**CONSULTATION, "status": "closed", "moderation_reason": "Duplicate"}
    with (
        patch("app.common.consultations.service.repo.get_by_id", new=AsyncMock(side_effect=[CONSULTATION, closed])),
        patch("app.common.consultations.service.repo.moderate", new=AsyncMock()) as write,
        patch("app.common.consultations.service.log_admin_action", new=AsyncMock(), create=True) as log,
    ):
        result = await consultations_service.moderate(ADMIN, "c-1", "close", "Duplicate")
    write.assert_awaited_once_with(ADMIN.access_token, "c-1", "closed", "Duplicate")
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    log.assert_not_awaited()
    assert result["status"] == "closed"


@pytest.mark.asyncio
async def test_moderating_a_missing_consultation_writes_and_audits_nothing():
    with (
        patch("app.common.consultations.service.repo.get_by_id", new=AsyncMock(return_value=None)),
        patch("app.common.consultations.service.repo.moderate", new=AsyncMock()) as write,
        patch("app.common.consultations.service.log_admin_action", new=AsyncMock(), create=True) as log,
        pytest.raises(HTTPException) as refused,
    ):
        await consultations_service.moderate(ADMIN, "c-1", "cancel", "Spam")
    assert refused.value.status_code == 404
    write.assert_not_awaited()
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_consultation_the_database_refuses_to_moderate_is_not_audited():
    # 23514: guard_consultations_update refuses a consultation that is no longer open.
    refusal = APIError({"code": "23514", "message": "Cannot move a consultation from closed to closed"})
    with (
        patch("app.common.consultations.service.repo.get_by_id", new=AsyncMock(return_value=CONSULTATION)),
        patch("app.common.consultations.service.repo.moderate", new=AsyncMock(side_effect=refusal)),
        patch("app.common.consultations.service.log_admin_action", new=AsyncMock(), create=True) as log,
        pytest.raises(AppHTTPException) as refused,
    ):
        await consultations_service.moderate(ADMIN, "c-1", "close", "again")
    assert refused.value.status_code == 422
    log.assert_not_awaited()


# --- order administrative actions (SRDS §14; BR-11: no money moves)

ORDER = {"id": "o-1", "status": "confirmed", "admin_action_reason": None}


def test_an_admin_cancellation_needs_a_reason(as_user):
    as_user(ADMIN)
    with patch("app.common.orders.router.service.cancel_order_as_admin", new=AsyncMock()) as cancel:
        assert client.post("/api/v1/admin/orders/o-1/cancel", json={"reason": "   "}).status_code == 422
        assert client.post("/api/v1/admin/orders/o-1/cancel", json={}).status_code == 422
    cancel.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_admin_cancellation_before_dispatch_leaves_the_audit_to_the_database():
    cancelled = {**ORDER, "status": "cancelled", "admin_action_reason": "Fraud"}
    with (
        patch("app.common.orders.service.repo.fetch_order_by_id", new=AsyncMock(side_effect=[ORDER, cancelled])),
        patch("app.common.orders.service.repo.cancel_order_as_admin", new=AsyncMock(return_value=cancelled)) as write,
        patch("app.common.orders.service.log_admin_action", new=AsyncMock(), create=True) as log,
    ):
        result = await orders_service.cancel_order_as_admin(ADMIN, "o-1", "Fraud")
    write.assert_awaited_once_with(ADMIN.access_token, "o-1", "Fraud")
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    log.assert_not_awaited()
    assert result["status"] == "cancelled"


@pytest.mark.parametrize("status", ["dispatched", "completed", "disputed", "cancelled", "refunded"])
@pytest.mark.asyncio
async def test_an_order_past_dispatch_or_closed_is_not_cancelled_or_audited(status):
    with (
        patch(
            "app.common.orders.service.repo.fetch_order_by_id", new=AsyncMock(return_value={**ORDER, "status": status})
        ),
        patch("app.common.orders.service.repo.cancel_order_as_admin", new=AsyncMock()) as write,
        patch("app.common.orders.service.log_admin_action", new=AsyncMock(), create=True) as log,
        pytest.raises(AppHTTPException) as refused,
    ):
        await orders_service.cancel_order_as_admin(ADMIN, "o-1", "Too late")
    assert refused.value.status_code == 422
    write.assert_not_awaited()
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_a_missing_order_is_a_404_with_no_audit():
    with (
        patch("app.common.orders.service.repo.fetch_order_by_id", new=AsyncMock(return_value=None)),
        patch("app.common.orders.service.log_admin_action", new=AsyncMock(), create=True) as log,
        pytest.raises(HTTPException) as refused,
    ):
        await orders_service.cancel_order_as_admin(ADMIN, "o-1", "Fraud")
    assert refused.value.status_code == 404
    log.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_order_cancellation_the_database_refuses_is_not_audited():
    refusal = APIError({"code": "23514", "message": "An admin cancellation needs a reason"})
    with (
        patch("app.common.orders.service.repo.fetch_order_by_id", new=AsyncMock(return_value=ORDER)),
        patch("app.common.orders.service.repo.cancel_order_as_admin", new=AsyncMock(side_effect=refusal)),
        patch("app.common.orders.service.log_admin_action", new=AsyncMock(), create=True) as log,
        pytest.raises(AppHTTPException) as refused,
    ):
        await orders_service.cancel_order_as_admin(ADMIN, "o-1", "Fraud")
    assert refused.value.status_code == 422
    log.assert_not_awaited()


def test_the_admin_order_list_passes_the_status_filter(as_user):
    as_user(ADMIN_AAL1)
    with patch("app.admin.router.service.fetch_all_orders", new=AsyncMock(return_value=[])) as fetch:
        response = client.get("/api/v1/admin/orders?status=disputed")
    assert response.status_code == 200, response.text
    fetch.assert_awaited_once_with(ADMIN_AAL1, "disputed")
