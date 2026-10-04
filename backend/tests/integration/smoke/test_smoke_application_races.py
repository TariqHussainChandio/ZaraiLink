"""A3b verification L1 and N1: an application cannot change between submit_application()'s completeness check and its
commit, and a submission cannot slip past a change that is still in progress.

Two real database sessions, both as the applicant (role `authenticated` with their id in the JWT claims, as PostgREST
sets them), race each other in the local stack's database: one holds its transaction open with pg_sleep while the
other starts. Every change to an application takes the owner's profile row first (lock_editable_application()), the
row the submission locks, so the second session waits and then either sees the first one's result or is refused. A
single-session pgTAP test cannot show this; without the lock both sides succeed (found by the independent verifier).
"""

from __future__ import annotations

import json
import subprocess
import time

from conftest import _local_db_container

HOLD_SECONDS = 3


def _as_user(user_id: str, statement: str, hold: bool = False) -> list[str]:
    claims = json.dumps({"sub": user_id, "role": "authenticated"})
    hold_sql = f" select pg_sleep({HOLD_SECONDS});" if hold else ""
    sql = (
        f"begin; set local role authenticated; set local request.jwt.claims = '{claims}'; "
        f"{statement};{hold_sql} commit;"
    )
    return [
        "docker",
        "exec",
        "-i",
        _local_db_container(),
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-c",
        sql,
    ]


def _race(user_id: str, first: str, second: str) -> tuple[subprocess.CompletedProcess, subprocess.CompletedProcess]:
    """Runs `first` holding its transaction open, starts `second` while it is held, and returns both results."""
    held = subprocess.Popen(
        _as_user(user_id, first, hold=True), stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    time.sleep(1)
    started = time.monotonic()
    late = subprocess.run(_as_user(user_id, second), capture_output=True, text=True)
    waited = time.monotonic() - started
    out, err = held.communicate()
    assert waited > 1, f"the second session did not wait for the first ({waited:.1f}s)"
    return subprocess.CompletedProcess(held.args, held.returncode, out, err), late


def _state(user_id: str) -> str:
    sql = (
        "select account_status || '/' || (application_submitted_at is not null) "
        f"from public.profiles where id = '{user_id}'"
    )
    return subprocess.run(
        ["docker", "exec", _local_db_container(), "psql", "-U", "postgres", "-d", "postgres", "-At", "-c", sql],
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def _licence_document(user_id: str) -> str:
    return (
        "delete from public.dealer_documents d using public.required_documents r "
        f"where d.required_document_id = r.id and r.code = 'business_licence' and d.dealer_id = '{user_id}'"
    )


def test_a_document_removed_during_a_submission_keeps_the_application_out_of_the_queue(make_applicant):
    dealer_id, _, _ = make_applicant("dealer", submit=False)
    held, submit = _race(dealer_id, _licence_document(dealer_id), "select public.submit_application()")
    assert held.returncode == 0, held.stderr
    assert submit.returncode != 0
    assert "missing: Business licence" in submit.stderr, submit.stderr
    assert _state(dealer_id) == "pending/false"


def test_a_submission_in_progress_freezes_the_documents_it_checked(make_applicant):
    dealer_id, _, _ = make_applicant("dealer", submit=False)
    held, delete = _race(dealer_id, "select public.submit_application()", _licence_document(dealer_id))
    assert held.returncode == 0, held.stderr
    assert delete.returncode != 0
    assert "cannot be changed now" in delete.stderr, delete.stderr
    assert _state(dealer_id) == "pending/true"


def test_a_submission_in_progress_freezes_the_details_it_checked(make_applicant):
    # N1: the business details and the expert's specializations take the same lock as the documents.
    dealer_id, _, _ = make_applicant("dealer", submit=False)
    held, update = _race(
        dealer_id,
        "select public.submit_application()",
        f"update public.dealer_profiles set business_name = 'Changed after submit' where id = '{dealer_id}'",
    )
    assert held.returncode == 0, held.stderr
    assert update.returncode != 0
    assert "cannot be changed now" in update.stderr, update.stderr

    expert_id, _, _ = make_applicant("expert", submit=False)
    held, delete = _race(
        expert_id,
        "select public.submit_application()",
        f"delete from public.expert_specializations where expert_id = '{expert_id}'",
    )
    assert held.returncode == 0, held.stderr
    assert delete.returncode != 0
    assert "cannot be changed now" in delete.stderr, delete.stderr
