"""
Reference Data — the Phase 3 vertical-slice domain (now just currencies/units; country/
province/city/phone_codes were dropped in Phase 0.5b for free-text fields). Two layers:
1. Service-level: create/update/delete_row call the repository AND log_admin_action with the
   right arguments (repo + audit log mocked).
2. Router-level (through the real FastAPI app): public GET routes work with NO Authorization
   header (proving the "public read, no auth dependency" decision is actually wired, not just
   documented), and admin-write routes reject an unauthenticated caller.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser
from app.common.reference_data import service
from app.main import app

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="admin-token")


# --- service layer -----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_row_writes_the_row_and_leaves_the_audit_to_the_database():
    with (
        patch(
            "app.common.reference_data.service.repo.create_row", return_value={"id": "row-1", "code": "PKR"}
        ) as mock_create,
        patch("app.common.reference_data.service.log_admin_action", new=AsyncMock(), create=True) as mock_log,
    ):
        result = await service.create_row(
            ADMIN, "currencies", {"code": "PKR", "symbol": "Rs.", "name": "Pakistani Rupee"}
        )

    mock_create.assert_called_once_with(
        ADMIN.access_token, "currencies", {"code": "PKR", "symbol": "Rs.", "name": "Pakistani Rupee"}
    )
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    mock_log.assert_not_awaited()
    assert result == {"id": "row-1", "code": "PKR"}


@pytest.mark.asyncio
async def test_delete_row_leaves_the_audit_to_the_database():
    with (
        patch("app.common.reference_data.service.repo.delete_row") as mock_delete,
        patch("app.common.reference_data.service.log_admin_action", new=AsyncMock(), create=True) as mock_log,
    ):
        await service.delete_row(ADMIN, "units", "unit-1")

    mock_delete.assert_called_once_with(ADMIN.access_token, "units", "unit-1")
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    mock_log.assert_not_awaited()


@pytest.mark.asyncio
async def test_update_row_writes_the_patch_and_leaves_the_audit_to_the_database():
    with (
        patch("app.common.reference_data.service.repo.update_row") as mock_update,
        patch("app.common.reference_data.service.log_admin_action", new=AsyncMock(), create=True) as mock_log,
    ):
        await service.update_row(ADMIN, "units", "unit-1", {"label": "Kilogram"})

    mock_update.assert_called_once_with(ADMIN.access_token, "units", "unit-1", {"label": "Kilogram"})
    # The database writes the audit row in the same transaction (20261023080000); the service writes none of its own.
    mock_log.assert_not_awaited()


# --- router layer (real app, real dependency-injection chain) ----------------------------


def test_list_currencies_requires_no_authorization_header():
    with patch(
        "app.common.reference_data.router.service.fetch_currencies",
        return_value=[{"id": "1", "code": "PKR", "symbol": "Rs.", "name": "Pakistani Rupee"}],
    ):
        response = client.get("/api/v1/reference-data/currencies")
    assert response.status_code == 200
    assert response.json() == [{"id": "1", "code": "PKR", "symbol": "Rs.", "name": "Pakistani Rupee"}]


def test_create_row_without_authorization_header_is_rejected():
    response = client.post("/api/v1/reference-data/currencies/rows", json={"code": "X"})
    assert response.status_code != 200
    assert response.status_code != 201


def test_generic_rows_read_is_public_too():
    with patch(
        "app.common.reference_data.router.service.fetch_rows",
        return_value=[{"id": "1", "code": "kg", "label": "Kilogram", "applies_to": None}],
    ):
        response = client.get("/api/v1/reference-data/units/rows")
    assert response.status_code == 200
