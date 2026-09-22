"""
P0 baseline (expected failure): the disease API must not accept URLs the server could be made to
fetch on the caller's behalf.

Finding C2 in the standardization plan: `POST /api/v1/disease/cases` stores whatever `image_url`
the client sends (via the service-role client), and `POST /api/v1/disease/predict` later fetches
that URL from the server. Observed on the local stack in P0: the server fetched its own gateway
and itself, and answered differently for reachable vs unreachable addresses (a reachability
oracle). No content is returned to the caller, so this is a blind SSRF, rated High.

This test asserts the CORRECT behaviour, so today it fails. `strict=True` means CI goes red the
moment a fix lands, which forces whoever fixes it (phase P3) to delete the marker instead of
leaving a stale expected-failure behind. It deliberately fakes only the repository write, so it
needs no database and runs in the normal CI job.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, require_authenticated_user
from app.main import app

INTERNAL_URLS = [
    "http://169.254.169.254/latest/meta-data/",  # cloud instance metadata service
    "http://127.0.0.1:8000/health",  # the API itself
    "http://localhost/",
    "http://[::1]/",
    "file:///etc/passwd",
]


@pytest.fixture
def buyer_client():
    app.dependency_overrides[require_authenticated_user] = lambda: AuthenticatedUser(
        id="00000000-0000-0000-0000-000000000001",
        email=None,
        role="buyer",
        access_token="test-token",
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.xfail(
    strict=True,
    reason="C2 (plan phase P3): create_case accepts any client-supplied image_url. "
    "Remove this marker when the endpoint validates the source.",
)
@pytest.mark.parametrize("url", INTERNAL_URLS)
def test_create_case_rejects_urls_the_server_should_never_fetch(buyer_client, url):
    stored = {
        "id": "case-1",
        "user_id": "00000000-0000-0000-0000-000000000001",
        "crop_id": None,
        "image_url": url,
        "created_at": "2026-09-21T00:00:00Z",
    }
    with patch("app.services.disease_service.disease_repository.create_case", return_value=stored) as create:
        response = buyer_client.post("/api/v1/disease/cases", json={"image_url": url})

    assert response.status_code in (400, 422)
    create.assert_not_called()
