"""
Router-level test: exercises the real FastAPI app + dependency-injection chain (not an isolated
function call) to confirm /api/v1/disease/predict actually rejects an unauthenticated request
end-to-end — this is the concrete regression test for the recon's CRITICAL finding ("the
backend's only real endpoint has no authentication").
"""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_predict_without_authorization_header_is_rejected():
    response = client.post("/api/v1/disease/predict", json={"disease_case_id": "any-id"})
    assert response.status_code == 401


def test_health_check_does_not_require_auth():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
