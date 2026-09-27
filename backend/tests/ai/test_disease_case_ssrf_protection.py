"""
Security fix C2 (standardization plan P3, docs/process/standardization-plan.md §1.2): the disease
API must not accept anything the server could be made to fetch on the caller's behalf.

`POST /api/v1/disease/cases` used to store whatever `image_url` the client sent (via the
service-role client), and `POST /api/v1/disease/predict` later fetched that URL from the server.
Observed on the local stack in P0: the server fetched its own gateway and itself, and answered
differently for reachable vs. unreachable addresses (a reachability oracle) — a blind SSRF.

The fix removes the client's ability to name a URL at all: `create_case` now takes a
`storage_path` inside the disease-images bucket, validated by the schema's pattern (shape) and by
disease_service.create_case (identity — the path's folder segment must be the caller's own user
id). This file was `xfail(strict=True)` from P0 until the fix landed; the marker is gone now that
it passes for real, and the payloads below prove the fix through the NEW `storage_path` contract
rather than the old `image_url` one.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, require_authenticated_user
from app.main import app

CALLER_ID = "00000000-0000-0000-0000-000000000001"
OTHER_USER_ID = "00000000-0000-0000-0000-000000000002"

# The exact strings P0 used to prove the SSRF (a cloud metadata service, the API loopback back to
# itself, IPv6 loopback, a file:// URI) — sent here as the storage_path itself. None of them can
# ever reach the schema's pattern (a single folder segment + a plain filename, no `:`, no `//`),
# so each is rejected before disease_repository.create_case is ever called — proving the new
# contract structurally can't carry a URL, not just that these particular strings are blocked.
SSRF_PAYLOADS = [
    "http://169.254.169.254/latest/meta-data/",  # cloud instance metadata service
    "http://127.0.0.1:8000/health",  # the API itself
    "http://localhost/",
    "http://[::1]/",
    "file:///etc/passwd",
]


@pytest.fixture
def buyer_client():
    app.dependency_overrides[require_authenticated_user] = lambda: AuthenticatedUser(
        id=CALLER_ID,
        email=None,
        role="buyer",
        access_token="test-token",
    )
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.mark.parametrize("payload", SSRF_PAYLOADS)
def test_create_case_rejects_url_shaped_payloads(buyer_client, payload):
    with patch("app.services.disease_service.disease_repository.create_case") as create:
        response = buyer_client.post("/api/v1/disease/cases", json={"storage_path": payload})

    assert response.status_code in (400, 422)
    create.assert_not_called()


@pytest.mark.parametrize(
    "payload",
    [
        f"{CALLER_ID}/../../../etc/passwd",  # path traversal out of the caller's own folder
        "../shared/photo.jpg",  # no folder segment matching a user id at all
        "photo.jpg",  # missing the required folder segment entirely
        f"/{CALLER_ID}/photo.jpg",  # leading slash
    ],
)
def test_create_case_rejects_path_traversal_and_malformed_paths(buyer_client, payload):
    with patch("app.services.disease_service.disease_repository.create_case") as create:
        response = buyer_client.post("/api/v1/disease/cases", json={"storage_path": payload})

    assert response.status_code in (400, 422)
    create.assert_not_called()


def test_create_case_rejects_an_excessively_long_storage_path(buyer_client):
    # Found by this phase's verifier: the regex alone has no length bound, so a 100,000+ char
    # string passed shape validation. Not exploitable for SSRF (it never reaches an outbound
    # request), but a defense-in-depth gap versus every other validated field in this codebase.
    with patch("app.services.disease_service.disease_repository.create_case") as create:
        response = buyer_client.post("/api/v1/disease/cases", json={"storage_path": f"{CALLER_ID}/" + "a" * 300})

    assert response.status_code == 422
    create.assert_not_called()


def test_create_case_rejects_a_storage_path_under_a_different_users_id(buyer_client):
    # Shape-valid (passes the schema's regex) but points at another user's uploaded object — the
    # regex alone can't express ownership, so disease_service.create_case checks it directly.
    with patch("app.services.disease_service.disease_repository.create_case") as create:
        response = buyer_client.post("/api/v1/disease/cases", json={"storage_path": f"{OTHER_USER_ID}/photo.jpg"})

    assert response.status_code == 422
    create.assert_not_called()


def test_create_case_accepts_a_storage_path_under_the_callers_own_id(buyer_client):
    stored = {
        "id": "case-1",
        "user_id": CALLER_ID,
        "crop_id": None,
        "storage_path": f"{CALLER_ID}/photo.jpg",
        "created_at": "2026-09-22T00:00:00Z",
    }
    with (
        patch("app.services.disease_service.disease_repository.create_case", return_value=stored) as create,
        patch(
            "app.services.disease_service.disease_repository.create_signed_url",
            return_value="https://example.supabase.co/storage/signed?token=abc",
        ),
    ):
        response = buyer_client.post("/api/v1/disease/cases", json={"storage_path": f"{CALLER_ID}/photo.jpg"})

    assert response.status_code == 200, response.text
    assert response.json()["image_signed_url"] == "https://example.supabase.co/storage/signed?token=abc"
    create.assert_called_once_with(CALLER_ID, None, f"{CALLER_ID}/photo.jpg")
