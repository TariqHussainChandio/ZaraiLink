# Definition of done

A task is finished only when every box is true and you can point at the evidence for each. "Tests pass" is
not on this list on its own, because the earlier failures passed every test.

- [ ] **Acceptance tests were written first.** For a bug, the test was seen failing before the fix, and it fails
      again if the fix is reverted.
- [ ] **A real path ran.** The user-visible behaviour worked from the emulator or device, through the real API,
      to a real local database, with output attached. For an API-only change, the same through `curl` or a
      real-stack test.
- [ ] **Tests are at the right level.** Unit tests for pure logic; real-stack tests for anything that crosses a
      layer; mocks only at the outer edge of paid or messaging third parties.
- [ ] **Security-relevant changes have a two-user proof.** One user allowed, another rejected, both shown.
- [ ] **The mechanical gates are green** and no recorded count was raised:
      `python scripts/check_reality.py --tools knip`, and in `backend/`
      `uv run python ../scripts/check_reality.py --tools ruff,ruff-format,mypy`, plus lint, typecheck, and tests.
- [ ] **Migrations were validated in the local Docker stack first,** with explicit `GRANT`s, row-level security,
      indexes, and a policy test. Nothing was pushed to the real project without the maintainer's approval.
- [ ] **No dummy data** entered any real project.
- [ ] **Docs are current:** the feature register row, any affected page under `docs/`, and an ADR when a decision
      was made.
- [ ] **Outside services:** an Integration Brief exists, or the feature is hidden and marked `Blocked`.
- [ ] **A different agent or person verified it** ([checklist](verifier-checklist.md)).
- [ ] **Not done / blocked is written down,** including the case where the answer is "nothing".
- [ ] **Left uncommitted** in the working tree for the maintainer to test and commit, unless told otherwise.
