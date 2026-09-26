"""P5 (item 4) — the HTTP hardening layer, observed on a real running server.

Request-ID, security headers, the body-size cap and problem+json errors are pure ASGI middleware and
handlers; these tests send real requests and read the real responses, so a middleware that stops applying
(as the default rate limit briefly did after the FastAPI upgrade) fails here instead of going unnoticed.
"""

from __future__ import annotations

import httpx

CATEGORIES = "/api/v1/marketplace/categories"


def test_a_request_id_is_minted_and_an_inbound_one_is_echoed(backend_url):
    minted = httpx.get(f"{backend_url}{CATEGORIES}", timeout=10)
    assert len(minted.headers["X-Request-ID"]) >= 16
    echoed = httpx.get(f"{backend_url}{CATEGORIES}", headers={"X-Request-ID": "trace-abc-123"}, timeout=10)
    assert echoed.headers["X-Request-ID"] == "trace-abc-123"


def test_security_headers_are_on_every_response_including_errors(backend_url):
    for path in (CATEGORIES, "/no/such/route"):
        response = httpx.get(f"{backend_url}{path}", timeout=10)
        assert response.headers["X-Content-Type-Options"] == "nosniff"
        assert response.headers["X-Frame-Options"] == "DENY"
        assert response.headers["Content-Security-Policy"] == "default-src 'none'"


def test_errors_are_problem_json(backend_url):
    response = httpx.get(f"{backend_url}/no/such/route", timeout=10)
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["status"] == 404


def test_an_oversized_body_is_refused_before_it_reaches_a_handler(backend_url):
    response = httpx.post(f"{backend_url}/api/v1/orders/checkout", content=b"x" * (10 * 1024 * 1024 + 1), timeout=30)
    assert response.status_code == 413
    assert response.headers["content-type"].startswith("application/problem+json")


def test_a_chunked_body_with_no_content_length_is_cut_off_at_the_cap(backend_url, world, api_client):
    def chunks():
        for _ in range(11):
            yield b"x" * (1024 * 1024)

    # httpx sends a generator as Transfer-Encoding: chunked, so there is no Content-Length to check up front.
    try:
        response = httpx.post(
            f"{backend_url}/api/v1/orders/checkout",
            content=chunks(),
            headers={"Authorization": f"Bearer {world.buyer.token}", "Content-Type": "application/json"},
            timeout=30,
        )
    except httpx.WriteError:
        return  # the server closed the connection mid-upload, which is also a refusal
    assert response.status_code == 413, response.text
    assert response.headers["content-type"].startswith("application/problem+json")
