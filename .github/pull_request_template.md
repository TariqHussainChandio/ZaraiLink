## What changed and why

<!-- One or two sentences. Link the issue, finding id (for example C1), or plan phase. -->

## Evidence

<!-- Paste real output, not "tests pass". A reviewer will re-run it. -->

- [ ] **A real path ran** on the real local stack (emulator or curl, real API, local Supabase). Commands and output:

- [ ] **Security-relevant?** Two-user proof, allowed and rejected, both shown:

- [ ] **A test fails without this change** (or an expected-failure marker was removed because the defect is fixed):

## Checklist

- [ ] The reality gate passes and no recorded count was raised (`python scripts/check_reality.py`)
- [ ] Lint, typecheck, and tests pass locally
- [ ] Feature register updated in `docs/status/feature-register.md`, if a capability changed
- [ ] Docs updated (or an ADR added) if behaviour or a decision changed
- [ ] Migrations: validated in local Docker, explicit `GRANT`s, row-level security, policy test; not pushed to a real project
- [ ] No dummy or seed user data outside the disposable local stack
- [ ] Uses an outside service? An Integration Brief is linked and a live smoke test is attached, or the feature is hidden and marked `Blocked`

## Not done / blocked

<!-- Everything you left undone and why. Write "nothing" only if it is true. -->
