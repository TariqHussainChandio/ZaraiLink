"""
Router-level tests: the real FastAPI app and its dependency chain (not an isolated function call).

- /api/v1/disease/predict rejects an unauthenticated request end to end (the recon's CRITICAL finding, "the backend's
  only real endpoint has no authentication").
- D11 (A6): creating a case and running the model are farmer-only. Only the base `get_current_user` is overridden
  here, so the real `require_farmer` role check stays in the chain and decides. The real-stack proof with real tokens
  for every role is tests/integration/smoke/test_smoke_ai_advisory.py.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.main import app

client = TestClient(app)

CALLER_ID = "00000000-0000-0000-0000-000000000001"


def test_predict_without_authorization_header_is_rejected():
    response = client.post("/api/v1/disease/predict", json={"disease_case_id": "any-id"})
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/v1/disease/cases"),
        ("GET", "/api/v1/disease/cases/any-id"),
        ("GET", "/api/v1/disease/knowledge"),
    ],
)
def test_every_disease_route_needs_a_session(method, path):
    assert client.request(method, path, json={}).status_code == 401


def test_health_check_does_not_require_auth():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.fixture
def as_role():
    def _as(role: str) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: AuthenticatedUser(
            id=CALLER_ID, email=None, role=role, access_token="test-token"
        )
        return TestClient(app)

    yield _as
    app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["buyer", "dealer", "expert", "admin"])
def test_only_a_farmer_may_create_a_case(as_role, role):
    with patch("app.ai.service.disease_repository.create_case", new_callable=AsyncMock) as create:
        response = as_role(role).post("/api/v1/disease/cases", json={"storage_path": f"{CALLER_ID}/leaf.jpg"})
    assert response.status_code == 403, response.text
    assert response.json()["title"] == "Insufficient role"
    create.assert_not_called()


@pytest.mark.parametrize("role", ["buyer", "dealer", "expert", "admin"])
def test_only_a_farmer_may_run_the_model(as_role, role):
    with patch("app.ai.service.disease_repository.get_disease_case", new_callable=AsyncMock) as read:
        response = as_role(role).post("/api/v1/disease/predict", json={"disease_case_id": "case-1"})
    assert response.status_code == 403, response.text
    read.assert_not_called()  # refused before the case is even looked up


def test_a_farmer_passes_the_role_check(as_role):
    stored = {
        "id": "case-1",
        "user_id": CALLER_ID,
        "crop_id": None,
        "storage_path": f"{CALLER_ID}/leaf.jpg",
        "created_at": "2026-10-01T00:00:00Z",
    }
    with (
        patch("app.ai.service.disease_repository.create_case", new_callable=AsyncMock, return_value=stored),
        patch("app.ai.service.disease_repository.create_signed_url", new_callable=AsyncMock, return_value="https://s"),
    ):
        response = as_role("farmer").post("/api/v1/disease/cases", json={"storage_path": f"{CALLER_ID}/leaf.jpg"})
    assert response.status_code == 200, response.text


@pytest.mark.parametrize("role", ["farmer", "buyer", "dealer", "expert", "admin"])
def test_any_signed_in_role_may_read_the_knowledge_base(as_role, role):
    # Reference content (SRDS §34-§35): read with the caller's own token, so RLS still applies.
    with patch(
        "app.ai.service.disease_repository.list_knowledge_as_user", new_callable=AsyncMock, return_value=[]
    ) as read:
        response = as_role(role).get("/api/v1/disease/knowledge")
    assert response.status_code == 200, response.text
    read.assert_awaited_once_with("test-token")
