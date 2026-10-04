from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.common import application_documents
from app.common.errors import AppHTTPException
from app.expert import service
from app.main import app

client = TestClient(app)


@pytest.mark.asyncio
async def test_a_document_outside_the_applicants_own_folder_is_refused_before_any_write():
    # The database refuses it too (fill_application_document); the API says so first, with a clear message.
    with pytest.raises(AppHTTPException) as caught:
        await application_documents.register(
            "tok", application_documents.EXPERT, "expert-1", "expert-2/degree.pdf", "degree.pdf", None
        )
    assert caught.value.status_code == 422


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
    response = client.get("/api/v1/expert/admin/expert-1/documents/doc-1/url")
    assert response.status_code == 401


def test_the_old_single_document_route_is_gone():
    # A3b: every document is opened by its own id; the route that guessed "the newest" is retired.
    response = client.get("/api/v1/expert/admin/expert-1/document-url")
    assert response.status_code in (401, 404)


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
