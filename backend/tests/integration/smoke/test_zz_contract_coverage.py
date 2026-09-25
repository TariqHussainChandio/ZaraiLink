"""P7 (7A): which documented operations did the smoke suite never exercise against the contract?

Runs last (the zz prefix) and reads what contract.check() recorded during the session. An operation with a JSON or
empty success response that no test called has never had its real payload compared with its published schema, so it
must be listed in NOT_EXERCISED with the reason; a new route cannot ship unchecked, and a route that gains a test
must be removed from the list (the reverse check fails too, so the list cannot go stale).
"""

from __future__ import annotations

import contract
import pytest

# (METHOD, path template) -> why the suite does not call it against the real stack.
NOT_EXERCISED: dict[tuple[str, str], str] = {}


def _success_operations() -> set[tuple[str, str]]:
    found = set()
    for template, methods in contract.spec()["paths"].items():
        for method, operation in methods.items():
            if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"} and any(
                code.startswith("2") for code in operation["responses"]
            ):
                found.add((method.upper(), template))
    return found


def test_every_documented_operation_was_checked_against_the_contract_or_is_listed(world):
    if not contract.VALIDATED:
        pytest.skip("no contract checks recorded (this file was run on its own)")
    documented = _success_operations()
    unchecked = documented - contract.VALIDATED - set(NOT_EXERCISED)
    stale = set(NOT_EXERCISED) & contract.VALIDATED
    assert not unchecked, f"operations never checked against the OpenAPI contract: {sorted(unchecked)}"
    assert not stale, f"listed as not exercised, but the suite now checks them: {sorted(stale)}"
