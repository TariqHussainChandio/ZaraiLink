from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser
from app.expert import service
from app.main import app

client = TestClient(app)

ADMIN = AuthenticatedUser(id="admin-1", email="a@x.com", role="admin", access_token="tok")


@pytest.mark.asyncio
async def test_document_url_returns_none_when_no_verification_exists():
    with patch(
        "app.expert.service.fetch_expert_for_admin_by_id",
        return_value={"expert_verifications": []},
    ):
        assert await service.get_document_url(ADMIN, "expert-1") is None


@pytest.mark.asyncio
async def test_document_url_uses_newest_verifications_document_path_not_a_client_supplied_one():
    expert = {
        "expert_verifications": [
            {"document_url": "expert-1/newest.pdf", "created_at": "2026-02-01T00:00:00Z"},
        ]
    }
    with patch("app.expert.service.fetch_expert_for_admin_by_id", return_value=expert):
        with patch(
            "app.expert.service.repo.create_document_signed_url", return_value="https://signed/newest.pdf"
        ) as mock_sign:
            url = await service.get_document_url(ADMIN, "expert-1")

    mock_sign.assert_called_once_with(ADMIN.access_token, "expert-1/newest.pdf")
    assert url == "https://signed/newest.pdf"


def test_sorted_verifications_puts_newest_first():
    expert = {
        "expert_verifications": [
            {"created_at": "2026-01-01T00:00:00Z"},
            {"created_at": "2026-03-01T00:00:00Z"},
            {"created_at": "2026-02-01T00:00:00Z"},
        ]
    }
    sorted_expert = service._sorted_verifications(expert)
    dates = [v["created_at"] for v in sorted_expert["expert_verifications"]]
    assert dates == ["2026-03-01T00:00:00Z", "2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z"]


def test_document_url_route_requires_admin():
    response = client.get("/api/v1/expert/admin/expert-1/document-url")
    assert response.status_code != 200


def test_list_experts_route_is_public():
    with patch("app.expert.router.service.fetch_experts", return_value=[]):
        response = client.get("/api/v1/expert")
    assert response.status_code == 200


def test_admin_route_is_matched_before_generic_expert_id_route():
    # If route ordering were wrong, GET /api/v1/expert/admin would be interpreted as
    # GET /api/v1/expert/{expert_id} with expert_id="admin" (the public route) instead of the
    # admin-only list route — this would leak the wrong response shape/auth requirement.
    response = client.get("/api/v1/expert/admin")
    # Admin route requires auth -> 401, NOT the public single-expert 200/404 path.
    assert response.status_code == 401
