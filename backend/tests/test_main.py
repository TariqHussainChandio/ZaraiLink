"""
App-level security hardening (Phase 1): CORS allowlist and rate limiting are both wired at the
`FastAPI()` instance in main.py rather than per-endpoint, so they're exercised here against the
real app rather than in an endpoint-specific test file.
"""

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.auth.dependencies import AuthenticatedUser, get_current_user
from app.main import app

client = TestClient(app)


def test_cors_allows_configured_origin():
    response = client.get("/health", headers={"Origin": "http://localhost:8081"})
    assert response.headers.get("access-control-allow-origin") == "http://localhost:8081"


def test_cors_rejects_unlisted_origin():
    response = client.get("/health", headers={"Origin": "https://evil.example.com"})
    assert "access-control-allow-origin" not in response.headers


def test_predict_rate_limit_returns_429_after_ten_requests_per_minute():
    farmer = AuthenticatedUser(id="farmer-1", email="f@x.com", role="farmer", access_token="tok")
    app.dependency_overrides[get_current_user] = lambda: farmer
    mock_prediction = {
        "id": "p1",
        "disease_case_id": "c1",
        "predicted_disease": "healthy",
        "confidence_score": 0.9,
        "description": None,
        "recommended_actions": [],
        "model_version": "x",
        "created_at": "2026-01-01T00:00:00Z",
    }
    try:
        with patch("app.ai.service.predict", return_value=mock_prediction):
            statuses = [
                client.post("/api/v1/disease/predict", json={"disease_case_id": "c1"}).status_code for _ in range(11)
            ]
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429
