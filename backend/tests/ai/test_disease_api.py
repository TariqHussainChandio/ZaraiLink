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


def test_supported_crops_without_authorization_header_is_rejected():
    assert client.get("/api/v1/disease/crops").status_code == 401


def test_supported_crops_lists_the_model_crops_for_a_signed_in_user():
    from app.auth.dependencies import AuthenticatedUser, require_authenticated_user

    app.dependency_overrides[require_authenticated_user] = lambda: AuthenticatedUser(
        id="u-1", email="u@x.com", role="farmer", access_token="t"
    )
    try:
        response = client.get("/api/v1/disease/crops")
    finally:
        app.dependency_overrides.pop(require_authenticated_user, None)
    assert response.status_code == 200
    names = [c["name"] for c in response.json()["crops"]]
    assert len(names) == 14
    assert "Tomato" in names
    assert "Wheat" not in names
