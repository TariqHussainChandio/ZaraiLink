from collections.abc import Iterator
from contextlib import contextmanager
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.auth.dependencies import AuthenticatedUser, get_current_user, get_optional_user
from app.common.reviews import repository, service
from app.main import app

client = TestClient(app)

BUYER = AuthenticatedUser(id="buyer-1", email="b@x.com", role="buyer", access_token="tok")
OTHER_BUYER = AuthenticatedUser(id="buyer-2", email="b2@x.com", role="buyer", access_token="tok2")
ADMIN_AAL1 = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok-a1", aal="aal1")
ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok-a2", aal="aal2")

COMPLETED_ORDER = {
    "id": "order-1",
    "seller_id": "seller-1",
    "buyer_id": BUYER.id,
    "status": "completed",
    "order_items": [{"listing_id": "listing-1"}, {"listing_id": "listing-2"}],
}

VISIBLE_REVIEW = {
    "id": "review-1",
    "order_id": "order-1",
    "consultation_id": None,
    "listing_id": "listing-1",
    "seller_id": "seller-1",
    "buyer_id": BUYER.id,
    "rating": 2,
    "comment": "late",
    "created_at": "2026-10-12T08:00:00+00:00",
    "hidden_at": None,
    "hidden_reason": None,
}
HIDDEN_REVIEW = {**VISIBLE_REVIEW, "hidden_at": "2026-10-12T09:00:00+00:00", "hidden_reason": "Abusive language"}


# --- creating a review (BR-07) -------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_review_rejects_non_owner_of_order():
    with (
        patch("app.common.reviews.service.repo.get_order_for_review", return_value=COMPLETED_ORDER),
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.create_review(OTHER_BUYER, "order-1", None, 5, "great")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_review_rejects_incomplete_order():
    incomplete = {**COMPLETED_ORDER, "status": "pending"}
    with (
        patch("app.common.reviews.service.repo.get_order_for_review", return_value=incomplete),
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.create_review(BUYER, "order-1", None, 5, "great")
    assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_create_review_rejects_listing_not_in_order():
    with (
        patch("app.common.reviews.service.repo.get_order_for_review", return_value=COMPLETED_ORDER),
        pytest.raises(HTTPException) as exc_info,
    ):
        await service.create_review(BUYER, "order-1", "listing-not-in-this-order", 5, "great")
    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_create_review_derives_seller_id_from_order_not_client():
    with (
        patch("app.common.reviews.service.repo.get_order_for_review", return_value=COMPLETED_ORDER),
        patch("app.common.reviews.service.repo.create_review", return_value={"id": "r-1"}) as mock_create,
    ):
        await service.create_review(BUYER, "order-1", "listing-1", 5, "great")

    # seller_id passed to the repository comes from COMPLETED_ORDER["seller_id"], never from any
    # client-supplied value (there is no seller_id parameter on create_review at all).
    args, _kwargs = mock_create.call_args
    assert args[3] == "seller-1"


def test_create_review_without_authorization_header_is_rejected():
    response = client.post("/api/v1/reviews", json={"order_id": "order-1", "rating": 5})
    assert response.status_code == 401


# --- moderation: hide and restore (SRDS §14, §51, BR-15) ---------------------------------


@contextmanager
def _moderating(previous: dict | None, updated: dict | None = None, error: Exception | None = None) -> Iterator:
    """The review as the admin's token reads it (`previous`), the row the update returns, and the audit call."""
    with (
        patch("app.common.reviews.service.repo.fetch_review_for_moderation", AsyncMock(return_value=previous)),
        patch(
            "app.common.reviews.service.repo.set_review_hidden",
            AsyncMock(return_value=updated, side_effect=error),
        ) as write,
        patch("app.common.reviews.service.log_admin_action", new_callable=AsyncMock, create=True) as audit,
    ):
        yield write, audit


@pytest.mark.asyncio
async def test_hiding_a_review_writes_the_reason_and_leaves_the_audit_to_the_database():
    with _moderating(VISIBLE_REVIEW, HIDDEN_REVIEW) as (write, audit):
        result = await service.hide_review(ADMIN, "review-1", "Abusive language")

    assert result == HIDDEN_REVIEW
    write.assert_awaited_once_with(ADMIN.access_token, "review-1", "Abusive language")
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_restoring_a_hidden_review_clears_it_and_leaves_the_audit_to_the_database():
    with _moderating(HIDDEN_REVIEW, VISIBLE_REVIEW) as (write, audit):
        result = await service.restore_review(ADMIN, "review-1")

    assert result == VISIBLE_REVIEW
    write.assert_awaited_once_with(ADMIN.access_token, "review-1", None)
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_restoring_a_visible_review_is_a_conflict_and_writes_nothing():
    with _moderating(VISIBLE_REVIEW) as (write, audit), pytest.raises(HTTPException) as exc_info:
        await service.restore_review(ADMIN, "review-1")
    assert exc_info.value.status_code == 409
    write.assert_not_awaited()
    audit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "moderate",
    [lambda: service.hide_review(ADMIN, "missing", "spam"), lambda: service.restore_review(ADMIN, "missing")],
    ids=["hide", "restore"],
)
async def test_moderating_a_missing_review_is_404_and_writes_nothing(moderate):
    with _moderating(None) as (write, audit), pytest.raises(HTTPException) as exc_info:
        await moderate()
    assert exc_info.value.status_code == 404
    write.assert_not_awaited()
    audit.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.parametrize(("code", "status"), [("42501", 403), ("23514", 422)])
async def test_a_database_refusal_is_a_clear_error_and_leaves_no_audit_row(code, status):
    # guard_reviews_update: 42501 without a second factor (or an edit beyond the hidden_* columns), 23514 without a
    # reason.
    refusal = APIError({"message": "refused", "code": code})
    with _moderating(VISIBLE_REVIEW, error=refusal) as (_write, audit), pytest.raises(HTTPException) as exc_info:
        await service.hide_review(ADMIN, "review-1", "spam")
    assert exc_info.value.status_code == status
    audit.assert_not_awaited()


@pytest.mark.asyncio
async def test_an_unexpected_database_error_is_not_swallowed_and_leaves_no_audit_row():
    with (
        _moderating(VISIBLE_REVIEW, error=APIError({"message": "boom", "code": "XX000"})) as (_write, audit),
        pytest.raises(APIError),
    ):
        await service.hide_review(ADMIN, "review-1", "spam")
    audit.assert_not_awaited()


# --- the routes: who may moderate ----------------------------------------------------------


@contextmanager
def _as(user: AuthenticatedUser | None) -> Iterator[None]:
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_optional_user] = lambda: user
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(get_optional_user, None)


def test_a_review_cannot_be_deleted_by_anyone():
    # Hiding replaces deleting (SRDS §14): the route is gone, and the database revoked delete as well.
    with _as(ADMIN):
        response = client.delete("/api/v1/reviews/review-1")
    assert response.status_code in (404, 405)
    assert "DELETE" not in {
        method
        for route in app.routes
        if getattr(route, "path", "").startswith("/api/v1/reviews")
        for method in route.methods
    }


@pytest.mark.parametrize("path", ["/api/v1/reviews/review-1/hide", "/api/v1/reviews/review-1/restore"])
@pytest.mark.parametrize(
    ("user", "status", "code"),
    [(ADMIN_AAL1, 403, "mfa_required"), (BUYER, 403, "insufficient_role")],
    ids=["admin-without-second-factor", "buyer"],
)
def test_moderation_needs_an_admin_with_a_second_factor(path, user, status, code):
    with (
        _as(user),
        patch("app.common.reviews.router.service.hide_review") as hide,
        patch("app.common.reviews.router.service.restore_review") as restore,
    ):
        response = client.patch(path, json={"reason": "spam"})
    assert response.status_code == status
    assert response.json()["code"] == code
    hide.assert_not_called()
    restore.assert_not_called()


def test_moderation_without_a_token_is_401():
    response = client.patch("/api/v1/reviews/review-1/hide", json={"reason": "spam"})
    assert response.status_code == 401


@pytest.mark.parametrize("body", [{}, {"reason": ""}, {"reason": "   "}, {"reason": "x" * 501}])
def test_hiding_needs_a_reason_of_1_to_500_characters(body):
    with _as(ADMIN), patch("app.common.reviews.router.service.hide_review") as hide:
        response = client.patch("/api/v1/reviews/review-1/hide", json=body)
    assert response.status_code == 422
    hide.assert_not_called()


def test_the_admin_with_a_second_factor_hides_with_the_trimmed_reason():
    with (
        _as(ADMIN),
        patch("app.common.reviews.router.service.hide_review", AsyncMock(return_value=HIDDEN_REVIEW)) as hide,
    ):
        response = client.patch("/api/v1/reviews/review-1/hide", json={"reason": "  Abusive language  "})
    assert response.status_code == 200, response.text
    assert response.json()["hidden_reason"] == "Abusive language"
    hide.assert_awaited_once_with(ADMIN, "review-1", "Abusive language")


@pytest.mark.parametrize(("user", "status"), [(None, 401), (BUYER, 403)], ids=["anonymous", "buyer"])
def test_the_moderation_list_is_admin_only(user, status):
    with _as(user), patch("app.common.reviews.router.service.fetch_reviews_for_moderation") as fetch:
        response = client.get("/api/v1/reviews/admin")
    assert response.status_code == status
    fetch.assert_not_called()


def test_the_moderation_list_is_a_read_so_the_admin_role_is_enough():
    with (
        _as(ADMIN_AAL1),
        patch(
            "app.common.reviews.router.service.fetch_reviews_for_moderation", AsyncMock(return_value=[HIDDEN_REVIEW])
        ) as fetch,
    ):
        response = client.get("/api/v1/reviews/admin?include_hidden=true")
    assert response.status_code == 200, response.text
    fetch.assert_awaited_once_with(ADMIN_AAL1, True)


# --- every public read leaves a hidden review out --------------------------------------------


class _Query:
    """Records the PostgREST builder calls a repository function makes and returns `rows`."""

    def __init__(self, rows: list[dict]):
        self.calls: list[tuple] = []
        self._rows = rows

    def __getattr__(self, name: str):
        if name == "not_":
            self.calls.append(("not_",))
            return self

        def record(*args, **kwargs):
            self.calls.append((name, *args))
            return self

        return record

    async def execute(self):
        return type("Response", (), {"data": self._rows})()


@contextmanager
def _public_client(rows: list[dict] | None = None) -> Iterator[_Query]:
    query = _Query(rows or [])
    with patch.object(repository, "get_public_client", return_value=query):
        yield query


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "read",
    [
        lambda: repository.fetch_review_by_id("review-1"),
        lambda: repository.fetch_review_by_order_id("order-1"),
        lambda: repository.fetch_review_by_consultation_id("consultation-1"),
        lambda: repository.fetch_reviews_for_listing("listing-1"),
        lambda: repository.fetch_reviews_for_seller("seller-1"),
        lambda: repository.fetch_reviews_for_expert("expert-1"),
    ],
    ids=["by-id", "by-order", "by-consultation", "by-listing", "by-seller", "by-expert"],
)
async def test_every_public_read_filters_out_hidden_reviews(read):
    # The listing, seller and expert lists feed every rating average (RatingSummary, expert analytics), so a hidden
    # review never counts in one. The anon select policy hides it too; this is the second layer.
    with _public_client() as query:
        await read()
    assert ("is_", "hidden_at", "null") in query.calls


@pytest.mark.asyncio
async def test_the_signed_in_author_also_reads_their_own_hidden_review_on_their_order():
    query = _Query([HIDDEN_REVIEW])
    with patch.object(repository, "get_user_scoped_client", AsyncMock(return_value=query)) as scoped:
        review = await repository.fetch_review_by_order_id("order-1", (BUYER.access_token, BUYER.id))
    scoped.assert_awaited_once_with(BUYER.access_token)
    assert review == HIDDEN_REVIEW
    # Visible reviews, or the caller's own: never another buyer's hidden review.
    assert ("or_", f"hidden_at.is.null,buyer_id.eq.{BUYER.id}") in query.calls
    assert ("eq", "order_id", "order-1") in query.calls


@pytest.mark.asyncio
async def test_the_moderation_list_shows_hidden_reviews_only_when_asked():
    for include_hidden in (False, True):
        query = _Query([])
        with patch.object(repository, "get_user_scoped_client", AsyncMock(return_value=query)):
            await repository.fetch_reviews_for_moderation(ADMIN.access_token, include_hidden)
        assert (("is_", "hidden_at", "null") in query.calls) is not include_hidden


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reason", "fields"),
    [
        ("spam", {"hidden_reason": "spam"}),
        (None, {"hidden_at": None, "hidden_reason": None}),
    ],
    ids=["hide", "restore"],
)
async def test_the_moderation_write_only_touches_the_hidden_columns(reason, fields):
    query = _Query([HIDDEN_REVIEW])
    with patch.object(repository, "get_user_scoped_client", AsyncMock(return_value=query)):
        await repository.set_review_hidden(ADMIN.access_token, "review-1", reason)
    (update,) = [call for call in query.calls if call[0] == "update"]
    sent = update[1]
    assert set(sent) == {"hidden_at", "hidden_reason"}  # hidden_by is stamped by guard_reviews_update, never sent
    assert {k: v for k, v in sent.items() if k in fields} == fields
    if reason is not None:
        assert sent["hidden_at"] is not None


def test_the_order_review_read_passes_the_signed_in_caller_through():
    with (
        _as(BUYER),
        patch(
            "app.common.reviews.router.service.fetch_review_by_order_id", AsyncMock(return_value=HIDDEN_REVIEW)
        ) as fetch,
    ):
        response = client.get("/api/v1/reviews/by-order/order-1")
    assert response.status_code == 200, response.text
    assert response.json()["hidden_reason"] == "Abusive language"
    fetch.assert_awaited_once_with("order-1", BUYER)


def test_the_order_review_read_stays_public():
    with (
        _as(None),
        patch("app.common.reviews.router.service.fetch_review_by_order_id", AsyncMock(return_value=None)) as fetch,
    ):
        response = client.get("/api/v1/reviews/by-order/order-1")
    assert response.status_code == 200, response.text
    fetch.assert_awaited_once_with("order-1", None)
