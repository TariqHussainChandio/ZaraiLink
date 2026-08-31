"""
Reference Data — the Phase 3 vertical-slice domain (now just currencies/units; country/
province/city/phone_codes were dropped in Phase 0.5b for free-text fields). Two layers:
1. Service-level: create/update/delete_row call the repository AND log_admin_action with the
   right arguments (repo + audit log mocked).
2. Router-level (through the real FastAPI app): public GET routes work with NO Authorization
   header (proving the "public read, no auth dependency" decision is actually wired, not just
   documented), and admin-write routes reject an unauthenticated caller.
"""

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser
from app.main import app
from app.services import reference_data_service as service

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="admin-token")


# --- service layer -----------------------------------------------------------------------


def test_create_row_logs_admin_action_with_new_state():
    with patch(
        "app.services.reference_data_service.repo.create_row", return_value={"id": "row-1", "code": "PKR"}
    ) as mock_create:
        with patch("app.services.reference_data_service.log_admin_action") as mock_log:
            result = service.create_row(ADMIN, "currencies", {"code": "PKR", "symbol": "Rs.", "name": "Pakistani Rupee"})

    mock_create.assert_called_once_with(
        ADMIN.access_token, "currencies", {"code": "PKR", "symbol": "Rs.", "name": "Pakistani Rupee"}
    )
    mock_log.assert_called_once_with(
        ADMIN,
        "create_reference_data",
        "currencies",
        "row-1",
        new_state={"code": "PKR", "symbol": "Rs.", "name": "Pakistani Rupee"},
    )
    assert result == {"id": "row-1", "code": "PKR"}


def test_delete_row_logs_admin_action():
    with patch("app.services.reference_data_service.repo.delete_row") as mock_delete:
        with patch("app.services.reference_data_service.log_admin_action") as mock_log:
            service.delete_row(ADMIN, "units", "unit-1")

    mock_delete.assert_called_once_with(ADMIN.access_token, "units", "unit-1")
    mock_log.assert_called_once_with(ADMIN, "delete_reference_data", "units", "unit-1")


# --- router layer (real app, real dependency-injection chain) ----------------------------


def test_list_currencies_requires_no_authorization_header():
    with patch(
        "app.api.v1.endpoints.reference_data.service.fetch_currencies",
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
    with patch("app.api.v1.endpoints.reference_data.service.fetch_rows", return_value=[{"id": "1"}]):
        response = client.get("/api/v1/reference-data/units/rows")
    assert response.status_code == 200
