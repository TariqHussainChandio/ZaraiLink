"""P5 (item 4, trusted-proxy configuration) — rate-limit buckets follow the client IP behind a proxy.

Each case starts its own real uvicorn with a 3/minute default limit and sends real requests carrying
`X-Forwarded-For`. When the peer (127.0.0.1) is trusted through FORWARDED_ALLOW_IPS, two forwarded clients
get two buckets; when it is not, a client cannot choose its bucket by sending the header, so all share one.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager

import httpx
import pytest
from conftest import ANON_KEY, BACKEND_DIR, LOCAL_URL, SERVICE_KEY, _free_port, _is_local

LIMITED_PATH = "/api/v1/marketplace/categories"


@contextmanager
def _server(forwarded_allow_ips: str):
    if not (_is_local and ANON_KEY and SERVICE_KEY):
        pytest.skip("needs the local Supabase stack")
    port = _free_port()
    env = {
        **os.environ,
        "SUPABASE_URL": LOCAL_URL,
        "SUPABASE_ANON_KEY": ANON_KEY,
        "SUPABASE_SERVICE_ROLE_KEY": SERVICE_KEY,
        "RATE_LIMIT_DEFAULT": "3/minute",
        "FORWARDED_ALLOW_IPS": forwarded_allow_ips,
    }
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".log", encoding="utf-8") as log:
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            for _ in range(60):
                try:
                    if httpx.get(f"{base}/health/live", timeout=1).status_code == 200:
                        break
                except httpx.HTTPError:
                    time.sleep(0.5)
            else:
                raise RuntimeError("server did not start")
            yield base
        finally:
            proc.terminate()
            proc.wait(timeout=10)


def _statuses(base: str, forwarded_for: str, count: int) -> list[int]:
    return [
        httpx.get(f"{base}{LIMITED_PATH}", headers={"X-Forwarded-For": forwarded_for}, timeout=10).status_code
        for _ in range(count)
    ]


def test_a_trusted_proxy_gives_each_forwarded_client_its_own_bucket():
    with _server("127.0.0.1") as base:
        assert _statuses(base, "203.0.113.10", 4) == [200, 200, 200, 429]
        limited = httpx.get(f"{base}{LIMITED_PATH}", headers={"X-Forwarded-For": "203.0.113.10"}, timeout=10)
        assert limited.headers["content-type"].startswith("application/problem+json")
        assert limited.json()["code"] == "rate_limited"
        assert limited.headers["Retry-After"] == "60"
        assert _statuses(base, "203.0.113.11", 1) == [200]


def test_an_untrusted_peer_cannot_pick_its_bucket_with_the_header():
    with _server("10.255.255.255") as base:
        assert _statuses(base, "203.0.113.10", 3) == [200, 200, 200]
        assert _statuses(base, "203.0.113.11", 1) == [429]
