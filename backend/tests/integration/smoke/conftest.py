"""
P5a "Backend repair" smoke matrix (docs/process/standardization-plan.md). P0 found that most of
the backend has never been exercised against a real database — 25 write paths (N1), 4 read routes
(N2), and every service-role call on a fresh database (N3) all crashed, invisible because every
existing backend test mocks the Supabase client. These tests hit a REAL running FastAPI process
over real HTTP, backed by the real local Supabase stack, so the class of bug that slipped past 151
mocked tests can't slip past these too.

Needs a LOCAL Supabase stack and refuses to run against anything else — see
test_signup_role_escalation.py for the exact setup commands. Spawns its own real `uvicorn`
subprocess with SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY set explicitly to the
LOCAL_SUPABASE_* values already used everywhere else in this test suite — it never reads
backend/.env (which, on a real dev machine, may well point at the hosted project), so a
misconfigured environment can 404/skip but can never accidentally touch a real project.
"""

from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import contract
import httpx
import pyotp
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[3]

LOCAL_URL = os.environ.get("LOCAL_SUPABASE_URL", "")
ANON_KEY = os.environ.get("LOCAL_SUPABASE_ANON_KEY", "")
SERVICE_KEY = os.environ.get("LOCAL_SUPABASE_SERVICE_ROLE_KEY", "")

_is_local = LOCAL_URL.startswith(("http://127.0.0.1", "http://localhost"))
_SKIP_REASON = (
    "needs a local Supabase stack (supabase start) and LOCAL_SUPABASE_URL / "
    "LOCAL_SUPABASE_ANON_KEY / LOCAL_SUPABASE_SERVICE_ROLE_KEY; never point this at a hosted project"
)

# `pytestmark` only auto-applies when set inside a test *module*; set here in conftest.py, pytest
# silently ignores it, so every smoke test ran unconditionally regardless of env vars — caught by
# a real CI run of the mocked "Backend" job (no local stack), which hit a real
# `httpx.UnsupportedProtocol` from `backend_url` trying to health-check `http://:` (empty
# LOCAL_SUPABASE_URL), instead of skipping cleanly. The guard belongs on the shared fixture every
# smoke test depends on instead, which works regardless of which file requests it.

PASSWORD = "Passw0rd!123"
RUN = uuid.uuid4().hex[:8]


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="session")
def backend_url():
    """Spawns a real `uvicorn app.main:app` subprocess pointed at the local Supabase stack, waits
    for it to become healthy, tears it down at the end of the session. Never touches the
    developer's own backend/.env — the subprocess gets its own explicit environment.

    stdout/stderr go to a real temp file, not `subprocess.PIPE`. A pipe has a small kernel buffer
    (~64KB on Windows) and nothing here was draining it while the backend ran; P5's structured
    logging pushed per-session log volume high enough over a full matrix run that a write to a
    full pipe blocked the backend's single-worker event loop outright partway through, hanging
    every request after it — a real bug, found and root-caused against this exact fixture, not a
    flaky test. A file has no comparable size limit."""
    if not (_is_local and ANON_KEY and SERVICE_KEY):
        pytest.skip(_SKIP_REASON)
    port = _free_port()
    env = {
        **os.environ,
        "SUPABASE_URL": LOCAL_URL,
        "SUPABASE_ANON_KEY": ANON_KEY,
        "SUPABASE_SERVICE_ROLE_KEY": SERVICE_KEY,
        # The default 200/minute per caller would throttle the property-based contract test (hundreds of requests as one
        # user) into 429s. The limiter itself is proven separately, on its own server (test_smoke_proxy_headers.py).
        "RATE_LIMIT_DEFAULT": "100000/minute",
    }
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".log", encoding="utf-8") as log_file:
        # ZARAILINK_COVERAGE=1 runs the backend under coverage (serve_measured.py), so the combined-coverage gate
        # counts the code these real requests execute (pytest-cov cannot see into this subprocess).
        measured = os.environ.get("ZARAILINK_COVERAGE") == "1"
        command = (
            [sys.executable, str(Path(__file__).with_name("serve_measured.py")), str(port)]
            if measured
            else [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)]
        )
        proc = subprocess.Popen(
            command,
            cwd=BACKEND_DIR,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            healthy = False
            for _ in range(60):
                try:
                    if httpx.get(f"{base}/health", timeout=1).status_code == 200:
                        healthy = True
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.5)
            if not healthy:
                proc.terminate()
                log_file.seek(0)
                output = log_file.read()
                raise RuntimeError(f"backend never became healthy on {base}:\n{output}")
            yield base
        finally:
            if measured and os.name == "nt":
                proc.send_signal(signal.CTRL_BREAK_EVENT)  # graceful, so coverage writes its data file
            else:
                proc.terminate()  # SIGTERM; a plain server stops at once, the measured one saves first
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


# ------------------------------------------------------------------ Supabase Auth helpers


def _auth_headers(token: str | None) -> dict[str, str]:
    if token is None:
        return {"apikey": ANON_KEY}
    return {"apikey": ANON_KEY, "Authorization": f"Bearer {token}"}


_seq = [0]


def make_user(role: str) -> tuple[str, str, str]:
    """Creates a real, pre-confirmed user through the Auth admin API (never through public
    signup — that path is deliberately restricted to non-admin roles by design, see the P3
    role-escalation fix) and returns (id, email, access_token)."""
    _seq[0] += 1
    email = f"smoke-{role}-{RUN}-{_seq[0]}@example.test"
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        created = http.post(
            "/auth/v1/admin/users",
            headers=_auth_headers(SERVICE_KEY),
            json={
                "email": email,
                "password": PASSWORD,
                "email_confirm": True,
                "user_metadata": {"role": role, "full_name": f"Smoke {role.title()} {_seq[0]}"},
            },
        )
        created.raise_for_status()
        user_id = created.json()["id"]
        token_resp = http.post(
            "/auth/v1/token?grant_type=password",
            headers=_auth_headers(None),
            json={"email": email, "password": PASSWORD},
        )
        token_resp.raise_for_status()
        return user_id, email, token_resp.json()["access_token"]


def enrol_totp_and_get_aal2_token(access_token: str) -> str:
    """P4 (4A.4): `world`'s shared admin needs aal2 for the same reason a real admin does — every
    admin-write endpoint now requires it (auth/dependencies.py:require_admin_aal2). Drives the same 3-call
    sequence a mobile enrolment screen would (enrol -> challenge -> verify) straight against
    Supabase Auth's REST API, matching how every other auth operation in this codebase bypasses
    FastAPI entirely. `pyotp` stands in for the user's authenticator app."""
    with httpx.Client(base_url=LOCAL_URL, timeout=30) as http:
        enroll = http.post(
            "/auth/v1/factors",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {access_token}"},
            json={"factor_type": "totp"},
        )
        enroll.raise_for_status()
        factor = enroll.json()
        factor_id, secret = factor["id"], factor["totp"]["secret"]

        challenge = http.post(
            f"/auth/v1/factors/{factor_id}/challenge",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {access_token}"},
        )
        challenge.raise_for_status()
        challenge_id = challenge.json()["id"]

        verify = http.post(
            f"/auth/v1/factors/{factor_id}/verify",
            headers={"apikey": ANON_KEY, "Authorization": f"Bearer {access_token}"},
            json={"challenge_id": challenge_id, "code": pyotp.TOTP(secret).now()},
        )
        verify.raise_for_status()
        return verify.json()["access_token"]


def _local_db_container() -> str:
    names = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"], capture_output=True, text=True, check=True
    ).stdout.split()
    return next(n for n in names if n.startswith("supabase_db_"))


def promote_to_admin(user_id: str) -> None:
    """The only supported way to create an admin (docs/process/admin-bootstrap-runbook.md) — a
    single-transaction trigger bypass against a known existing user, never through signup, and
    never a plain UPDATE: `guard_profiles_role()` blocks any role change where `auth.uid()` is
    null (true for both a service-role PostgREST call and a raw superuser psql connection — it's
    not an RLS check, and RLS bypass doesn't exempt a session from triggers), exactly the same
    guard that blocks a public signup from self-escalating. See the runbook for why."""
    sql = (
        "begin; set local session_replication_role = replica; "
        f"update public.profiles set role = 'admin' where id = '{user_id}'; commit;"
    )
    subprocess.run(
        ["docker", "exec", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    )


# ------------------------------------------------------------------ shared cross-domain world


@dataclass
class Actor:
    id: str
    email: str
    token: str


@dataclass
class World:
    """Realistic, dependency-ordered fixture data built once per test session through real API
    calls — every smoke test file reuses this rather than re-deriving its own users and reference
    data. Promoted from docs/status/evidence/p0_core_reality.py's own proven flow."""

    farmer: Actor
    buyer: Actor
    buyer2: Actor
    dealer: Actor
    expert: Actor
    admin: Actor
    category_id: str
    farmer_listing_id: str
    dealer_store_id: str
    dealer_listing_id: str
    dealer_inventory_id: str
    farm_id: str
    extra: dict = field(default_factory=dict)


@pytest.fixture(scope="session")
def world(backend_url: str) -> World:
    # max_keepalive_connections=0: a keep-alive connection reused across dozens of requests
    # against uvicorn's single-worker dev server occasionally hangs on read after a slow request
    # (e.g. the disease predict() call, which runs real torch inference) — a fresh connection per
    # request avoids that class of flake entirely, at a small, one-time-per-request cost.
    c = httpx.Client(base_url=backend_url, timeout=60, limits=httpx.Limits(max_keepalive_connections=0))

    def api(method: str, path: str, token: str | None = None, **kw) -> httpx.Response:
        headers = {"Authorization": f"Bearer {token}"} if token else None
        response = c.request(method, path, headers=headers, **kw)
        contract.check(method, path, response)
        return response

    farmer_id, farmer_email, farmer_tok = make_user("farmer")
    buyer_id, buyer_email, buyer_tok = make_user("buyer")
    buyer2_id, buyer2_email, buyer2_tok = make_user("buyer")
    dealer_id, dealer_email, dealer_tok = make_user("dealer")
    expert_id, expert_email, expert_tok = make_user("expert")
    admin_id, admin_email, admin_tok = make_user("buyer")  # promoted below — admin is never self-selected
    promote_to_admin(admin_id)
    # The admin token was minted before the promotion; GoTrue tokens carry no role claim the
    # backend trusts anyway (auth/dependencies.py re-reads profiles.role per request), so the existing
    # token is still valid — only the database row's role matters.
    # P4 (4A.4): every admin-write endpoint now requires aal2 (require_admin_aal2), so world's
    # shared admin must actually enrol a second factor — replacing admin_tok with the
    # post-verification aal2 token, which is a superset of what the plain aal1 token could do.
    admin_tok = enrol_totp_and_get_aal2_token(admin_tok)

    cats = api("GET", "/api/v1/marketplace/categories", buyer_tok)
    assert cats.status_code == 200, f"reference data must be seeded: {cats.text}"
    assert cats.json(), "categories table must have at least one row (seed.sql)"
    category_id = cats.json()[0]["id"]

    # Consultations reference `experts(id)`, not just any profile (see N2's fix comment in
    # common/consultations/repository.py) — the expert user needs a real `experts` row before anything
    # can be assigned to them, which only exists after they submit an application. Done here in
    # the shared world (not in a per-domain test file) so it happens before every test file
    # regardless of alphabetical collection order.
    application = api(
        "POST",
        "/api/v1/expert/application",
        expert_tok,
        json={
            "profile": {
                "qualifications": "PhD Agronomy",
                "degree": "PhD",
                "experience": "10 years",
                "professional_description": "Smoke-test expert",
                "contact": "smoke@example.test",
                "specializations": ["plant_diseases", "crop_management"],
            },
        },
    )
    assert application.status_code in (200, 201), application.text

    # `experts` RLS only lets a non-owner read an *approved* row (public read of `approved`;
    # owner read/write own row) — left unapproved, every embedded `expert:...` join elsewhere
    # returns null for anyone but the expert themselves, not because of N2, but because the row
    # is genuinely invisible under RLS. Approve now so the rest of the world reflects a normal,
    # usable expert.
    admin_view = api("GET", f"/api/v1/expert/admin/{expert_id}", admin_tok)
    assert admin_view.status_code == 200, admin_view.text
    verifications = admin_view.json().get("expert_verifications") or []
    assert verifications, "submit_application must also create an expert_verifications row"
    approve = api(
        "PATCH",
        f"/api/v1/expert/admin/{expert_id}/verification",
        admin_tok,
        json={"verification_id": verifications[0]["id"], "decision": "approved", "notes": "smoke matrix"},
    )
    assert approve.status_code == 204, approve.text

    farm = api(
        "POST",
        "/api/v1/farmer/farms",
        farmer_tok,
        json={"name": f"Smoke farm {RUN}", "area": 5.0, "land_unit": "acres", "city": "Multan"},
    )
    assert farm.status_code in (200, 201), farm.text
    farm_id = farm.json()["id"]

    listing = api(
        "POST",
        "/api/v1/marketplace/listings",
        farmer_tok,
        json={
            "title": f"Smoke wheat {RUN}",
            "price": 100.0,
            "unit": "kg",
            "quantity": 50,
            "category_id": category_id,
            "description": "smoke matrix listing",
        },
    )
    assert listing.status_code in (200, 201), listing.text
    farmer_listing_id = listing.json()["id"]

    store = api("POST", "/api/v1/dealer/stores", dealer_tok, json={"name": f"Smoke store {RUN}"})
    assert store.status_code in (200, 201), store.text
    dealer_store_id = store.json()["id"]

    dealer_listing = api(
        "POST",
        "/api/v1/marketplace/listings",
        dealer_tok,
        json={
            "title": f"Smoke fertilizer {RUN}",
            "price": 500.0,
            "unit": "bag",
            "quantity": 100,
            "category_id": category_id,
            "brand": "Smoke",
            "condition": "new",
        },
    )
    assert dealer_listing.status_code in (200, 201), dealer_listing.text
    dealer_listing_id = dealer_listing.json()["id"]

    inventory = api(
        "POST",
        "/api/v1/dealer/inventory",
        dealer_tok,
        json={"listing_id": dealer_listing_id, "stock_quantity": 20, "unit": "bag", "min_stock_threshold": 2},
    )
    assert inventory.status_code in (200, 201), inventory.text
    dealer_inventory_id = inventory.json()["id"]

    return World(
        farmer=Actor(farmer_id, farmer_email, farmer_tok),
        buyer=Actor(buyer_id, buyer_email, buyer_tok),
        buyer2=Actor(buyer2_id, buyer2_email, buyer2_tok),
        dealer=Actor(dealer_id, dealer_email, dealer_tok),
        expert=Actor(expert_id, expert_email, expert_tok),
        admin=Actor(admin_id, admin_email, admin_tok),
        category_id=category_id,
        farmer_listing_id=farmer_listing_id,
        dealer_store_id=dealer_store_id,
        dealer_listing_id=dealer_listing_id,
        dealer_inventory_id=dealer_inventory_id,
        farm_id=farm_id,
    )


@pytest.fixture(scope="session")
def api_client(backend_url: str):
    """A plain httpx client factory bound to the real backend, for tests that don't need the
    full `world`. max_keepalive_connections=0 — see the `world` fixture's comment above."""
    with httpx.Client(base_url=backend_url, timeout=60, limits=httpx.Limits(max_keepalive_connections=0)) as c:

        def call(method: str, path: str, token: str | None = None, **kw) -> httpx.Response:
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            headers.update(kw.pop("headers", {}))
            response = c.request(method, path, headers=headers or None, **kw)
            contract.check(method, path, response)
            return response

        yield call


@pytest.fixture
def find_profile(api_client, world):
    """Looks a profile up in the admin user list by paging through it: the list is capped at 100 rows a
    page (P5c), and a long-lived local database holds far more smoke users than that."""

    def find(user_id: str) -> dict | None:
        offset = 0
        while True:
            page = api_client("GET", f"/api/v1/admin/users?limit=100&offset={offset}", world.admin.token)
            assert page.status_code == 200, page.text
            rows = page.json()
            for row in rows:
                if row["id"] == user_id:
                    return row
            if len(rows) < 100:
                return None
            offset += 100

    return find


@pytest.fixture(scope="session")
def make_actor():
    """`make_user` for test files, which cannot import conftest.py (this directory has no __init__.py)."""
    return make_user


@pytest.fixture(scope="session")
def matrix_actors(backend_url: str) -> dict[str, str]:
    """One fresh, real user per role for the authorization matrix (its own users, so its ~120 requests
    per actor neither share a rate-limit bucket with `world` nor mutate `world`'s actors). `admin` is
    the aal2 session; `admin_aal1` is the same admin before its second factor was verified."""
    tokens: dict[str, str] = {}
    for role in ("farmer", "buyer", "dealer", "expert"):
        tokens[role] = make_user(role)[2]
    admin_id, _, admin_aal1 = make_user("buyer")
    promote_to_admin(admin_id)
    tokens["admin_aal1"] = admin_aal1
    tokens["admin"] = enrol_totp_and_get_aal2_token(admin_aal1)
    return tokens
