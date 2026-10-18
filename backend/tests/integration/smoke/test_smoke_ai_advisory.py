"""A6 AI advisory on the real stack: a real FastAPI process, real tokens, the local Supabase database and Storage.

What it proves (plan A6, SRDS §34-§35, §53.39):
- a farmer uploads a leaf photo, records a case and runs the model; the answer carries the report built from the
  `disease_knowledge` table, with the advisory disclaimer (BR-13), and the case is marked `predicted` in the database;
- D11: a buyer, a dealer, an expert and the admin cannot upload into the disease-images bucket at all (storage RLS),
  and are refused (403) by the API when they try to record a case on a farmer's photo or to run the model;
- a case whose photo object is gone from storage still loads, with `image_signed_url: null`, and a fresh photo link
  is signed for ten minutes;
- row-level security decides who reads a case: the expert a consultation links it to reads it (and sees the report on
  the consultation), another expert and a buyer get 404 as for a missing id;
- the knowledge base is readable by every signed-in role;
- AI isolation (SRDS §53.39): on a second API process whose model checkpoint is missing, prediction answers a clear 503
  and marks the case `failed` (`model_unavailable`), while marketplace browse, orders, payments, messaging,
  consultations and the dealer inventory all answer normally.

Needs the local stack (see conftest.py); skips cleanly without it.
"""

from __future__ import annotations

import base64
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import contract
import httpx
import pytest
from conftest import (
    ANON_KEY,
    BACKEND_DIR,
    LOCAL_URL,
    SERVICE_KEY,
    _free_port,
    _local_db_container,
    approve_expert,
    make_user,
    sign_in,
)
from PIL import Image

MODEL_FILE = BACKEND_DIR / "app" / "ai" / "checkpoints" / "model.pth"
# A real checkpoint is ~9 MB; anything far smaller is a placeholder, which the engine reports as unavailable.
MODEL_PRESENT = MODEL_FILE.exists() and MODEL_FILE.stat().st_size > 1_000_000
OUTAGE_DETAIL = "The AI advisory is temporarily unavailable. Please try again later."
ROLES = ("farmer", "buyer", "dealer", "expert", "admin")


def _leaf_jpeg() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (96, 96), (40, 120, 50)).save(buffer, format="JPEG")
    return buffer.getvalue()


def _try_upload(user_id: str, token: str) -> tuple[str, httpx.Response]:
    """Tries to put a photo in the uploader's own folder of the private disease-images bucket, as the app does."""
    path = f"{user_id}/a6-{uuid.uuid4().hex[:10]}.jpg"
    response = httpx.post(
        f"{LOCAL_URL}/storage/v1/object/disease-images/{path}",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "image/jpeg"},
        content=_leaf_jpeg(),
        timeout=30,
    )
    return path, response


def _upload(user_id: str, token: str) -> str:
    path, response = _try_upload(user_id, token)
    assert response.status_code in (200, 201), response.text
    return path


def _service_headers() -> dict[str, str]:
    # The local stack's service-role key, read from the environment by conftest; never written into a test.
    return {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}


def _object_exists(path: str) -> bool:
    response = httpx.get(
        f"{LOCAL_URL}/storage/v1/object/info/disease-images/{path}", headers=_service_headers(), timeout=30
    )
    return response.status_code == 200


def _remove_object(path: str) -> None:
    """Removes a photo the way an operator would, with the service role (a farmer can no longer delete one)."""
    response = httpx.delete(
        f"{LOCAL_URL}/storage/v1/object/disease-images/{path}", headers=_service_headers(), timeout=30
    )
    assert response.status_code == 200, response.text
    assert not _object_exists(path)


def _token_lifetime(signed_url: str) -> int | None:
    """Seconds between `iat` and `exp` in a signed URL's token, or None if the token is not a JWT carrying them."""
    token = httpx.URL(signed_url).params.get("token")
    parts = token.split(".") if token else []
    if len(parts) != 3:
        return None
    payload = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    if "iat" not in payload or "exp" not in payload:
        return None
    return int(payload["exp"]) - int(payload["iat"])


def _db_case_state(case_id: str) -> tuple[str, str]:
    """(status, failure_reason) straight from the database, not through the API under test."""
    sql = f"select status || '|' || coalesce(failure_reason, '') from public.disease_cases where id = '{case_id}';"
    out = subprocess.run(
        ["docker", "exec", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()
    status, _, reason = out.partition("|")
    return status, reason


def _create_case(api_client, actor) -> str:
    case = api_client(
        "POST", "/api/v1/disease/cases", actor.token, json={"storage_path": _upload(actor.id, actor.token)}
    )
    assert case.status_code == 200, case.text
    assert "storage_path" not in case.json()
    assert case.json()["image_signed_url"]
    return case.json()["id"]


@pytest.fixture(scope="module")
def predicted_case(world, api_client) -> dict:
    """The farmer's case after one real prediction run (or a clean 503 when no checkpoint is installed)."""
    case_id = _create_case(api_client, world.farmer)
    predict = api_client("POST", "/api/v1/disease/predict", world.farmer.token, json={"disease_case_id": case_id})
    return {"id": case_id, "predict": predict}


# --------------------------------------------------------------------------- the farmer's path


def test_a_farmer_gets_a_report_from_the_knowledge_base(world, api_client, predicted_case):
    predict = predicted_case["predict"]
    case_id = predicted_case["id"]
    if not MODEL_PRESENT:
        # Weights are fetched from the private ml-models bucket (scripts/fetch_model_weights.py); without them the
        # outage path must be the clean one.
        assert predict.status_code == 503, predict.text
        assert predict.json()["title"] == OUTAGE_DETAIL
        assert _db_case_state(case_id) == ("failed", "model_unavailable")
        return

    assert predict.status_code == 200, predict.text
    body = predict.json()
    report = body["report"]
    assert body["disease_case_id"] == case_id
    assert 0.0 <= report["confidence_score"] <= 1.0
    assert report["confidence_band"] == ("confident" if report["confidence_score"] >= 0.60 else "low")
    assert report["disclaimer"].startswith("This is an AI suggestion, not a diagnosis.")
    assert report["model_version"]

    # The report text is the knowledge row for the predicted class, word for word (SRDS §34-§35).
    knowledge = api_client("GET", "/api/v1/disease/knowledge", world.farmer.token).json()
    row = next(k for k in knowledge if k["class_label"] == report["class_label"])
    assert report["advisory"] == row["advisory"]
    assert report["treatment"] == row["treatment"]
    assert report["review_status"] == row["review_status"]
    if row["review_status"] == "pending_review":
        assert "not yet been reviewed" in report["disclaimer"]

    assert _db_case_state(case_id) == ("predicted", "")
    read = api_client("GET", f"/api/v1/disease/cases/{case_id}", world.farmer.token)
    assert read.status_code == 200, read.text
    assert read.json()["status"] == "predicted"
    assert read.json()["prediction"]["id"] == body["id"]
    assert read.json()["report"]["class_label"] == report["class_label"]


# --------------------------------------------------------------------------- D11: farmers only


@pytest.mark.parametrize("role", ["buyer", "dealer", "expert", "admin"])
def test_only_a_farmer_may_create_a_case_or_run_the_model(world, api_client, predicted_case, role):
    actor = getattr(world, role)
    # (a) Storage: even into their own folder, a non-farmer's upload is refused by the bucket's policy (zl-db).
    own_path, upload = _try_upload(actor.id, actor.token)
    assert upload.status_code in (400, 403), upload.text
    assert not _object_exists(own_path)

    # (b) The API: a real photo, uploaded by the farmer, is still refused to the other role, so the refusal is about who
    # they are, not about whose path it is.
    farmer_path = _upload(world.farmer.id, world.farmer.token)
    created = api_client("POST", "/api/v1/disease/cases", actor.token, json={"storage_path": farmer_path})
    assert created.status_code == 403, created.text
    assert created.json()["title"] == "Insufficient role"

    predicted = api_client(
        "POST", "/api/v1/disease/predict", actor.token, json={"disease_case_id": predicted_case["id"]}
    )
    assert predicted.status_code == 403, predicted.text
    assert predicted.json()["title"] == "Insufficient role"


def test_a_case_whose_photo_is_gone_still_loads_and_links_live_ten_minutes(world, api_client):
    path = _upload(world.farmer.id, world.farmer.token)
    created = api_client("POST", "/api/v1/disease/cases", world.farmer.token, json={"storage_path": path})
    assert created.status_code == 200, created.text
    case_id = created.json()["id"]

    # A fresh link is signed for ten minutes (ai/service.py, _SIGNED_URL_SECONDS), checked in the token itself.
    lifetime = _token_lifetime(created.json()["image_signed_url"])
    if lifetime is not None:
        assert lifetime == 600, lifetime

    # Run the model while the photo is still there (or get the clean 503 without weights), so the case has its state.
    predict = api_client("POST", "/api/v1/disease/predict", world.farmer.token, json={"disease_case_id": case_id})
    assert predict.status_code == (200 if MODEL_PRESENT else 503), predict.text

    assert _object_exists(path)  # the existence check itself works, so the "gone" checks below mean something
    _remove_object(path)

    # The real storage error for a missing object is tolerated: 200, no link, and the rest of the case intact.
    read = api_client("GET", f"/api/v1/disease/cases/{case_id}", world.farmer.token)
    assert read.status_code == 200, read.text
    body = read.json()
    assert body["image_signed_url"] is None
    if MODEL_PRESENT:
        assert body["status"] == "predicted"
        assert body["report"]["class_label"] == predict.json()["report"]["class_label"]
        assert body["report"]["disclaimer"].startswith("This is an AI suggestion, not a diagnosis.")
    else:
        assert body["status"] == "failed"
        assert body["failure_reason"] == "model_unavailable"


def test_another_farmer_can_neither_run_nor_read_the_case(api_client, predicted_case):
    _, _, other_farmer = make_user("farmer")
    run = api_client("POST", "/api/v1/disease/predict", other_farmer, json={"disease_case_id": predicted_case["id"]})
    assert run.status_code == 404, run.text
    read = api_client("GET", f"/api/v1/disease/cases/{predicted_case['id']}", other_farmer)
    assert read.status_code == 404, read.text


# --------------------------------------------------------------------------- BR-13: the assigned expert reads it


@pytest.fixture(scope="module")
def second_expert(backend_url, world) -> str:
    expert_id, email, token = make_user("expert")
    approve_expert(backend_url, world.admin.token, expert_id, token)
    return sign_in(email)


def test_the_assigned_expert_reads_the_linked_case_and_no_one_else(world, api_client, predicted_case, second_expert):
    case_id = predicted_case["id"]
    # Before any consultation links it, even the expert who will be asked cannot see it.
    assert api_client("GET", f"/api/v1/disease/cases/{case_id}", world.expert.token).status_code == 404

    consultation = api_client(
        "POST",
        "/api/v1/consultations",
        world.farmer.token,
        json={"expert_id": world.expert.id, "subject": "A6 smoke: leaf spots", "disease_case_id": case_id},
    )
    assert consultation.status_code == 200, consultation.text
    assert consultation.json()["disease_case_id"] == case_id

    assigned = api_client("GET", f"/api/v1/disease/cases/{case_id}", world.expert.token)
    assert assigned.status_code == 200, assigned.text
    assert assigned.json()["id"] == case_id
    if MODEL_PRESENT:
        assert assigned.json()["report"]["disclaimer"]
        detail = api_client("GET", f"/api/v1/consultations/{consultation.json()['id']}", world.expert.token)
        assert detail.status_code == 200, detail.text
        assert detail.json()["ai_report"]["case_id"] == case_id
        assert detail.json()["ai_report"]["report"]["class_label"] == assigned.json()["report"]["class_label"]

    for outsider in (second_expert, world.buyer.token, world.dealer.token):
        refused = api_client("GET", f"/api/v1/disease/cases/{case_id}", outsider)
        assert refused.status_code == 404, refused.text


def test_a_farmer_cannot_link_someone_elses_case_to_a_consultation(world, api_client, predicted_case):
    _, _, other_farmer = make_user("farmer")
    refused = api_client(
        "POST",
        "/api/v1/consultations",
        other_farmer,
        json={"expert_id": world.expert.id, "subject": "not mine", "disease_case_id": predicted_case["id"]},
    )
    assert refused.status_code == 403, refused.text


# --------------------------------------------------------------------------- the knowledge base


@pytest.mark.parametrize("role", ROLES)
def test_every_signed_in_role_reads_the_knowledge_base(world, api_client, role):
    response = api_client("GET", "/api/v1/disease/knowledge", getattr(world, role).token)
    assert response.status_code == 200, response.text
    rows = response.json()
    assert len(rows) == 38  # one per model class (model_metadata.json), seeded by the A6 migration
    assert all(row["advisory"] and row["review_status"] in ("pending_review", "reviewed") for row in rows)
    assert sum(row["is_healthy"] for row in rows) >= 1


def test_the_knowledge_base_needs_a_session(api_client):
    assert api_client("GET", "/api/v1/disease/knowledge").status_code == 401


# --------------------------------------------------------------------------- AI isolation (SRDS §53.39)


@pytest.fixture(scope="module")
def outage_url(backend_url):
    """A second, real API process whose model checkpoint is missing, so the classifier loads as unavailable exactly as
    it would on a server where the weights were never fetched. Same database, same environment otherwise."""
    port = _free_port()
    missing = Path(tempfile.gettempdir()) / f"zarailink-no-model-{uuid.uuid4().hex}.pth"
    env = {
        **os.environ,
        "SUPABASE_URL": LOCAL_URL,
        "SUPABASE_ANON_KEY": ANON_KEY,
        "SUPABASE_SERVICE_ROLE_KEY": SERVICE_KEY,
        "RATE_LIMIT_DEFAULT": "100000/minute",
        "EMAIL_ENABLED": "false",
        "SMTP_USERNAME": "",
        "SMTP_PASSWORD": "",
        "MODEL_PATH": str(missing),
    }
    with tempfile.NamedTemporaryFile(mode="w+", suffix=".log", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port)],
            cwd=BACKEND_DIR,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            for _ in range(60):
                try:
                    if httpx.get(f"{base}/health", timeout=1).status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.5)
            else:
                log_file.seek(0)
                raise RuntimeError(f"the outage backend never became healthy:\n{log_file.read()}")
            yield base
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()


@pytest.fixture(scope="module")
def outage_client(outage_url):
    with httpx.Client(base_url=outage_url, timeout=60, limits=httpx.Limits(max_keepalive_connections=0)) as c:

        def call(method: str, path: str, token: str | None = None, **kw) -> httpx.Response:
            headers = {"Authorization": f"Bearer {token}"} if token else None
            response = c.request(method, path, headers=headers, **kw)
            contract.check(method, path, response)
            return response

        yield call


def test_with_the_model_down_prediction_is_a_clear_503_and_the_case_is_failed(world, outage_client):
    case_id = _create_case(outage_client, world.farmer)  # recording a case does not need the model
    predict = outage_client("POST", "/api/v1/disease/predict", world.farmer.token, json={"disease_case_id": case_id})
    assert predict.status_code == 503, predict.text
    assert predict.json()["title"] == OUTAGE_DETAIL
    assert "pth" not in predict.text  # no path or stack trace leaks
    assert "Traceback" not in predict.text
    assert _db_case_state(case_id) == ("failed", "model_unavailable")

    read = outage_client("GET", f"/api/v1/disease/cases/{case_id}", world.farmer.token)
    assert read.status_code == 200, read.text
    assert read.json()["status"] == "failed"
    assert read.json()["failure_reason"] == "model_unavailable"
    assert read.json()["report"] is None
    world.extra["failed_case_id"] = case_id


def test_with_the_model_down_the_rest_of_the_platform_answers_normally(world, outage_client):
    # Marketplace browse, public and signed in.
    assert outage_client("GET", "/api/v1/marketplace/listings").status_code == 200
    assert outage_client("GET", "/api/v1/marketplace/categories").status_code == 200
    listing = outage_client("GET", f"/api/v1/marketplace/listings/{world.farmer_listing_id}", world.buyer.token)
    assert listing.status_code == 200, listing.text

    # Orders: a real checkout and the order list.
    checkout = outage_client(
        "POST",
        "/api/v1/orders/checkout",
        world.buyer.token,
        json={"cart_items": [{"listing_id": world.farmer_listing_id, "quantity": 1}]},
    )
    assert checkout.status_code == 200, checkout.text
    order_id = checkout.json()[0]["id"]
    assert outage_client("GET", "/api/v1/orders", world.buyer.token).status_code == 200
    assert outage_client("GET", f"/api/v1/orders/{order_id}", world.farmer.token).status_code == 200

    # Payments: cash on delivery recorded against that order (BR-11: no held funds, only a record).
    payment = outage_client("POST", "/api/v1/payments", world.buyer.token, json={"order_id": order_id, "method": "cod"})
    assert payment.status_code in (200, 201), payment.text
    assert outage_client("GET", f"/api/v1/payments/{payment.json()['id']}", world.buyer.token).status_code == 200

    # Messaging: a conversation from the listing, one message, the list.
    conversation = outage_client(
        "POST",
        "/api/v1/messaging/conversations",
        world.buyer.token,
        json={"other_user_id": world.farmer.id, "context_type": "listing", "context_id": world.farmer_listing_id},
    )
    assert conversation.status_code in (200, 201), conversation.text
    sent = outage_client(
        "POST",
        f"/api/v1/messaging/conversations/{conversation.json()['id']}/messages",
        world.buyer.token,
        json={"body": "Is this still available? (AI outage smoke)"},
    )
    assert sent.status_code in (200, 201), sent.text
    assert outage_client("GET", "/api/v1/messaging/conversations", world.farmer.token).status_code == 200

    # Consultations: a farmer still asks an expert, even about the case the model could not analyse, and the expert
    # opens it without the AI report rather than with an error.
    failed_case = world.extra.get("failed_case_id")
    consultation = outage_client(
        "POST",
        "/api/v1/consultations",
        world.farmer.token,
        json={
            "expert_id": world.expert.id,
            "subject": "AI is down, please look",
            **({"disease_case_id": failed_case} if failed_case else {}),
        },
    )
    assert consultation.status_code == 200, consultation.text
    detail = outage_client("GET", f"/api/v1/consultations/{consultation.json()['id']}", world.expert.token)
    assert detail.status_code == 200, detail.text
    assert detail.json()["ai_report"] is None
    assert outage_client("GET", "/api/v1/consultations/mine", world.farmer.token).status_code == 200
    assert outage_client("GET", "/api/v1/consultations/assigned", world.expert.token).status_code == 200

    # Dealer inventory: the marketplace stock and the inventory system.
    assert outage_client("GET", "/api/v1/dealer/inventory", world.dealer.token).status_code == 200
    assert outage_client("GET", "/api/v1/inventory/dashboard", world.dealer.token).status_code == 200

    # Expert accounts and the health probes are untouched too.
    assert outage_client("GET", "/api/v1/expert").status_code == 200
    assert outage_client("GET", "/health/ready").status_code == 200
