"""SRDS §4 to §13, §45, §53 rules 4 to 9 (A3b): a dealer or expert application with documents, from draft to decision.

Real users through the real API, real Storage and the local mail catcher, nothing faked: the applicant uploads files
into their own folder of their role's bucket and attaches them; an incomplete application is refused with what is
missing; a submitted one is frozen and reaches the admin's queue; the admin opens each document from a short-lived
link and gets the exact bytes uploaded; a rejection and an approval each send the applicant an email, read back here
from Mailpit (the live proof of the email seam, backend/app/common/email.py); a rejected applicant corrects and
resubmits; and another user can neither read nor attach someone else's files.
"""

from __future__ import annotations

import os
import time
import uuid

import httpx
from conftest import (
    ANON_KEY,
    EXPERT_APPLICATION,
    LOCAL_URL,
    PASSWORD,
    PDF_BYTES,
    SERVICE_KEY,
    fill_application,
    upload_document,
)

MAILPIT_URL = os.environ.get("LOCAL_MAILPIT_URL", "http://127.0.0.1:54324")
REASON = "The business licence has expired; please attach the current one."


def latest_email(address: str, subject_part: str) -> dict:
    """The newest email to `address` whose subject contains `subject_part`, from Mailpit's API. The send has finished
    when the API call returns; Mailpit indexes a beat later, hence the short retry."""
    with httpx.Client(base_url=MAILPIT_URL, timeout=10) as mailpit:
        for _ in range(30):
            listing = mailpit.get("/api/v1/messages", params={"limit": 50})
            listing.raise_for_status()
            for message in listing.json()["messages"]:
                to_match = any(address == to["Address"] for to in message["To"])
                if to_match and subject_part in message["Subject"]:
                    return mailpit.get(f"/api/v1/message/{message['ID']}").json()
            time.sleep(0.5)
    raise TimeoutError(f"no email '{subject_part}' arrived for {address}")


def required(api_client, token: str) -> dict[str, dict]:
    response = api_client("GET", "/api/v1/profile/application/required-documents", token)
    assert response.status_code == 200, response.text
    return {document["code"]: document for document in response.json()}


def attach(api_client, role: str, user_id: str, token: str, document: dict, name: str) -> httpx.Response:
    path = upload_document(role, user_id, token, name)
    return api_client(
        "POST",
        f"/api/v1/{role}/application/documents",
        token,
        json={"storage_path": path, "file_name": name, "required_document_id": document["id"]},
    )


def test_a_dealer_application_from_draft_to_approval(world, api_client, make_actor, fresh_sign_in):
    dealer_id, dealer_email, token = make_actor("dealer")
    documents = required(api_client, token)
    assert {"business_registration", "business_licence"} <= set(documents)

    business = {
        "business_name": "Hyderabad Agri Inputs",
        "business_type": "wholesaler",
        "registration_number": "NTN-4455",
        "business_address": "7 Grain Market Road",
        "country": "Pakistan",
        "province": "Sindh",
        "city": "Hyderabad",
    }
    assert api_client("PUT", "/api/v1/dealer/application", token, json=business).status_code == 200

    licence = attach(api_client, "dealer", dealer_id, token, documents["business_licence"], "licence.pdf")
    assert licence.status_code == 201, licence.text
    # Size and type come from Storage, not from the client.
    assert licence.json()["size_bytes"] == len(PDF_BYTES)
    assert licence.json()["mime_type"] == "application/pdf"
    assert licence.json()["required_document"]["code"] == "business_licence"

    # Incomplete: refused, with what is missing; and an admin cannot decide a draft.
    incomplete = api_client("POST", "/api/v1/profile/application/submit", token)
    assert incomplete.status_code == 409, incomplete.text
    assert incomplete.json()["code"] == "application_incomplete"
    assert "Business registration certificate" in incomplete.json()["title"]
    draft = api_client(
        "PATCH", f"/api/v1/admin/users/{dealer_id}/account-status", world.admin.token, json={"status": "approved"}
    )
    assert draft.status_code == 409, draft.text
    queue = api_client("GET", "/api/v1/admin/dealer-applications", world.admin.token)
    assert dealer_id not in [row["id"] for row in queue.json()]

    registration = attach(
        api_client, "dealer", dealer_id, token, documents["business_registration"], "registration.pdf"
    )
    assert registration.status_code == 201, registration.text
    assert api_client("POST", "/api/v1/profile/application/submit", token).status_code == 204

    # Under review: frozen.
    locked = api_client("PUT", "/api/v1/dealer/application", token, json={**business, "business_name": "Changed"})
    assert locked.status_code == 403, locked.text
    assert locked.json()["code"] == "application_locked"
    removed = api_client("DELETE", f"/api/v1/dealer/application/documents/{licence.json()['id']}", token)
    assert removed.status_code == 403, removed.text

    # The admin reads the application and opens a document: the exact bytes uploaded.
    queue = api_client("GET", "/api/v1/admin/dealer-applications", world.admin.token)
    assert queue.status_code == 200, queue.text
    entry = next(row for row in queue.json() if row["id"] == dealer_id)
    assert entry["dealer_profile"]["business_name"] == "Hyderabad Agri Inputs"
    assert len(entry["dealer_documents"]) == 2
    detail = api_client("GET", f"/api/v1/admin/dealer-applications/{dealer_id}", world.admin.token)
    assert detail.status_code == 200, detail.text
    link = api_client(
        "GET",
        f"/api/v1/admin/dealer-applications/{dealer_id}/documents/{licence.json()['id']}/url",
        world.admin.token,
    )
    assert link.status_code == 200, link.text
    assert httpx.get(link.json()["url"], timeout=30).content == PDF_BYTES

    # Another user: no queue, no file, no attaching someone else's file.
    assert api_client("GET", "/api/v1/admin/dealer-applications", world.dealer.token).status_code == 403
    stolen = httpx.get(
        f"{LOCAL_URL}/storage/v1/object/authenticated/dealer-documents/{dealer_id}/licence.pdf",
        headers={"apikey": ANON_KEY, "Authorization": f"Bearer {world.dealer.token}"},
        timeout=30,
    )
    assert stolen.status_code != 200
    borrowed = api_client(
        "POST",
        "/api/v1/dealer/application/documents",
        world.dealer.token,
        json={"storage_path": f"{dealer_id}/licence.pdf", "file_name": "licence.pdf"},
    )
    assert borrowed.status_code in (403, 422), borrowed.text
    other_document = api_client(
        "GET",
        f"/api/v1/admin/dealer-applications/{world.dealer.id}/documents/{licence.json()['id']}/url",
        world.admin.token,
    )
    assert other_document.status_code == 404, "a document is opened only under its own applicant"

    # Rejection: the reason, in the app and in the email.
    rejected = api_client(
        "PATCH",
        f"/api/v1/admin/users/{dealer_id}/account-status",
        world.admin.token,
        json={"status": "rejected", "reason": REASON},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["email_delivered"] is True
    rejection = latest_email(dealer_email, "needs changes")
    assert REASON in rejection["Text"]
    assert "Update and resubmit" in rejection["Text"]

    # The dealer corrects the licence and resubmits; the registration certificate carries forward.
    removed = api_client("DELETE", f"/api/v1/dealer/application/documents/{licence.json()['id']}", token)
    assert removed.status_code == 204, removed.text
    missing = api_client("POST", "/api/v1/profile/application/submit", token)
    assert missing.json()["code"] == "application_incomplete", missing.text
    renewed = attach(api_client, "dealer", dealer_id, token, documents["business_licence"], "licence-2026.pdf")
    assert renewed.status_code == 201, renewed.text
    assert api_client("POST", "/api/v1/profile/application/submit", token).status_code == 204

    # Approval: the email carries what SRDS §9 lists, and after signing in again the dealer works.
    approved = api_client(
        "PATCH", f"/api/v1/admin/users/{dealer_id}/account-status", world.admin.token, json={"status": "approved"}
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["email_delivered"] is True
    approval = latest_email(dealer_email, "approved")
    for item in ("has been approved", f"Email: {dealer_email}", "Account type: Dealer", "sign in again", "Next steps"):
        assert item in approval["Text"], item
    fresh = fresh_sign_in(dealer_email)
    store = api_client("POST", "/api/v1/dealer/stores", fresh, json={"name": f"Store {uuid.uuid4().hex[:6]}"})
    assert store.status_code in (200, 201), store.text


def test_an_expert_application_reaches_the_queue_only_once_submitted(world, api_client, make_actor, backend_url):
    expert_id, expert_email, token = make_actor("expert")
    draft_id, _, draft_token = make_actor("expert")
    fill_application(backend_url, "expert", expert_id, token)
    fill_application(backend_url, "expert", draft_id, draft_token)
    assert api_client("POST", "/api/v1/profile/application/submit", token).status_code == 204

    queue = api_client("GET", "/api/v1/expert/admin?status=pending", world.admin.token)
    assert queue.status_code == 200, queue.text
    ids = [row["id"] for row in queue.json()]
    assert expert_id in ids
    assert draft_id not in ids, "a draft is not in the queue"

    detail = api_client("GET", f"/api/v1/expert/admin/{expert_id}", world.admin.token).json()
    assert detail["years_experience"] == 10
    assert detail["institution_affiliation"] == "Sindh Agriculture University"
    assert detail["profile"]["application_submitted_at"]
    assert len(detail["expert_verifications"]) == 1, "one submission record, written by submit_application()"
    document = detail["expert_documents"][0]
    link = api_client("GET", f"/api/v1/expert/admin/{expert_id}/documents/{document['id']}/url", world.admin.token)
    assert httpx.get(link.json()["url"], timeout=30).content == PDF_BYTES

    # Frozen while under review; the draft expert can still change theirs.
    attached = api_client(
        "POST",
        "/api/v1/expert/application/documents",
        token,
        json={"storage_path": f"{expert_id}/degree.pdf", "file_name": "again.pdf"},
    )
    assert attached.status_code in (403, 409), attached.text
    other = required(api_client, draft_token)["other"]
    added = attach(api_client, "expert", draft_id, draft_token, other, "publication.pdf")
    assert added.status_code == 201, added.text
    assert added.json()["required_document"]["code"] == "other"
    draft_documents = api_client("GET", "/api/v1/expert/application/documents", draft_token).json()
    removed = api_client("DELETE", f"/api/v1/expert/application/documents/{draft_documents[0]['id']}", draft_token)
    assert removed.status_code == 204, removed.text

    decided = api_client(
        "PATCH",
        f"/api/v1/expert/admin/{expert_id}/verification",
        world.admin.token,
        json={"decision": "approved", "notes": "Degree and experience checked"},
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["email_delivered"] is True
    approval = latest_email(expert_email, "approved")
    assert "Account type: Agricultural expert" in approval["Text"]
    assert "expert workspace" in approval["Text"]


def test_the_required_documents_are_an_audited_admin_setting(world, api_client, make_actor, matrix_actors):
    code = f"smoke_{uuid.uuid4().hex[:8]}"
    entry = {"role": "dealer", "code": code, "label": "Smoke tax certificate", "is_required": False}
    assert api_client("POST", "/api/v1/admin/required-documents", world.dealer.token, json=entry).status_code == 403
    no_mfa = api_client("POST", "/api/v1/admin/required-documents", matrix_actors["admin_aal1"], json=entry)
    assert no_mfa.status_code == 403, no_mfa.text
    created = api_client("POST", "/api/v1/admin/required-documents", world.admin.token, json=entry)
    assert created.status_code == 201, created.text
    document_id = created.json()["id"]
    try:
        _, _, dealer_token = make_actor("dealer")
        assert code in required(api_client, dealer_token), "a new dealer is asked for it"
        retired = api_client(
            "PATCH", f"/api/v1/admin/required-documents/{document_id}", world.admin.token, json={"active": False}
        )
        assert retired.status_code == 200, retired.text
        assert code not in required(api_client, dealer_token)
    finally:
        api_client(
            "PATCH", f"/api/v1/admin/required-documents/{document_id}", world.admin.token, json={"active": False}
        )
    logs = api_client("GET", "/api/v1/admin/audit-logs?target_entity=required_documents", world.admin.token).json()
    actions = sorted(e["action"] for e in logs if e["target_id"] == document_id)
    assert actions[:2] == ["required_document_created", "required_document_updated"]
    assert all(e["actor_id"] == world.admin.id for e in logs if e["target_id"] == document_id)


def test_a_registered_file_stays_and_a_missing_one_is_a_clean_404(world, api_client, make_applicant):
    # A3b verification, M1 and L2: the applicant cannot delete a file a document still names, so the stored type and
    # size stay true and a submitted document always has its file; if one is gone anyway, the admin gets a 404.
    dealer_id, _, token = make_applicant("dealer", submit=False)
    documents = api_client("GET", "/api/v1/dealer/application/documents", token).json()
    path = f"{dealer_id}/business_licence.pdf"
    headers = {"apikey": ANON_KEY, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    deleted = httpx.request(
        "DELETE",
        f"{LOCAL_URL}/storage/v1/object/dealer-documents",
        headers=headers,
        json={"prefixes": [path]},
        timeout=30,
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json() == [], "nothing was deleted"
    assert api_client("POST", "/api/v1/profile/application/submit", token).status_code == 204

    # Only an operator with the service role can remove it now; the admin's link then answers 404, not 500.
    service = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"}
    httpx.request(
        "DELETE",
        f"{LOCAL_URL}/storage/v1/object/dealer-documents",
        headers=service,
        json={"prefixes": [path]},
        timeout=30,
    )
    licence = next(d for d in documents if d["required_document"]["code"] == "business_licence")
    link = api_client(
        "GET", f"/api/v1/admin/dealer-applications/{dealer_id}/documents/{licence['id']}/url", world.admin.token
    )
    assert link.status_code == 404, link.text


def test_an_expert_under_review_is_told_the_application_is_locked(make_applicant, api_client):
    # A3b verification, L5: the same answer as a dealer, and nothing changes.
    _, _, token = make_applicant("expert")
    locked = api_client(
        "PATCH", "/api/v1/expert/application", token, json={**EXPERT_APPLICATION, "qualifications": "Changed"}
    )
    assert locked.status_code == 403, locked.text
    assert locked.json()["code"] == "application_locked"
    assert (
        api_client("GET", "/api/v1/expert/me", token).json()["qualifications"] == EXPERT_APPLICATION["qualifications"]
    )


def test_deciding_on_an_applicant_who_deleted_their_account_is_recorded_without_an_email(
    world, api_client, make_applicant
):
    # A3b verification round 2, N2: the recipient lookup fails on a soft-deleted user; the decision is already
    # committed, so the admin gets the result with `email_delivered: false`, never a 500.
    dealer_id, _, token = make_applicant("dealer")
    deleted = api_client("DELETE", "/api/v1/profile/me", token, json={"password": PASSWORD})
    assert deleted.status_code == 204, deleted.text
    decided = api_client(
        "PATCH", f"/api/v1/admin/users/{dealer_id}/account-status", world.admin.token, json={"status": "approved"}
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["email_delivered"] is False
