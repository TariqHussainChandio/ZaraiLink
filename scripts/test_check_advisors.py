"""Tests for scripts/ci/check_advisors.py: the gate must fail on what it should and only on that.

    python -m pytest scripts/test_check_advisors.py
"""

import importlib.util
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("check_advisors", Path(__file__).parent / "ci" / "check_advisors.py")
check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check)

ACCEPTED_VIEW = {
    "name": "security_definer_view",
    "level": "ERROR",
    "detail": "View `public.profiles_public` is defined with the SECURITY DEFINER property",
    "metadata": {"schema": "public", "name": "profiles_public", "type": "view"},
}


def finding(name: str, level: str, table: str = "orders") -> dict:
    return {
        "name": name,
        "level": level,
        "detail": f"{name} on {table}",
        "metadata": {"schema": "public", "name": table},
    }


def test_the_accepted_view_is_not_a_problem():
    problems, notes = check.evaluate([ACCEPTED_VIEW])
    assert problems == []
    assert any("profiles_public" in n for n in notes)


def test_a_warning_fails():
    problems, _ = check.evaluate([ACCEPTED_VIEW, finding("auth_rls_initplan", "WARN")])
    assert len(problems) == 1
    assert "auth_rls_initplan" in problems[0]


def test_another_security_definer_view_fails():
    other = {**ACCEPTED_VIEW, "metadata": {"schema": "public", "name": "secrets_view"}}
    problems, _ = check.evaluate([ACCEPTED_VIEW, other])
    assert len(problems) == 1


def test_an_unindexed_foreign_key_fails_even_though_the_tool_calls_it_info():
    problems, _ = check.evaluate([ACCEPTED_VIEW, finding("unindexed_foreign_keys", "INFO")])
    assert len(problems) == 1


def test_unused_indexes_on_an_empty_database_are_ignored():
    problems, _ = check.evaluate([ACCEPTED_VIEW, finding("unused_index", "INFO")])
    assert problems == []


def test_a_stale_allow_list_entry_fails():
    problems, _ = check.evaluate([])
    assert len(problems) == 1
    assert "stale" in problems[0]


def test_output_with_a_progress_line_before_the_json_parses():
    text = 'Connecting to local database...\n{"results": []}'
    assert check.parse(text) == []


def test_a_second_document_after_the_results_is_ignored():
    text = 'Connecting to local database...\n{"results": []}\n{"message": ""}\n'
    assert check.parse(text) == []
