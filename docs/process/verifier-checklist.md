# Verifier checklist

The verifier is a different agent or person from the implementer, starts with fresh context, and does not
take the implementer's word for anything. The job is to try to break the work.

## Before you start

1. Read the task card and its acceptance tests. If the tests are missing or vague, the task is not ready.
2. Check out the change on a clean local stack: `npx supabase db reset`, backend restarted from `backend/`.
3. Do not read the implementer's summary until you have run the checks yourself.

## Check

- [ ] **Re-run the acceptance tests yourself.** Do not accept pasted output.
- [ ] **Revert the fix, watch the test fail, restore it.** A test that cannot fail proves nothing.
- [ ] **Walk the real path** on the real local stack, as each affected role.
- [ ] **Try to break it:** wrong role, another user's id, expired or replayed token, oversized or malformed input,
      a suspended user, the service down. Security-relevant work needs the two-user proof re-run by you.
- [ ] **Look for the fake:** any mock, hard-coded value, stub, empty handler, swallowed error, or `TODO` in a
      production path (`python scripts/check_reality.py`). Any feature that works only because a test mocks it.
- [ ] **Read the diff for what is missing,** not just what is present: an endpoint with no consumer, a screen with
      no route, a button with no handler, a policy with no test.
- [ ] **Migrations:** validated in Docker, explicit `GRANT`s, policies use `(select auth.uid())`, indexes present,
      definer functions set `search_path`, no dummy data.
- [ ] **Outside services:** no code calls a service that has not been provisioned; live smoke output is real.
- [ ] **Feature register and docs** match what you observed, not what was claimed.

## Verdict

Record one of: `verified`, `verified with notes`, or `rejected`, with what you ran and what you saw. A rejection
lists each failed check. The implementer fixes and the verifier re-runs; the implementer never overrules it.
