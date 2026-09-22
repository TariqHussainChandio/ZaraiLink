# How work is done here

Short, mechanical, and checkable. These pages exist so that "done" means something the next person can verify.

| Page | Use it when |
|---|---|
| [`../../AGENTS.md`](../../AGENTS.md) | Starting any session: the ten rules every agent follows |
| [`standardization-plan.md`](standardization-plan.md) | Choosing what to work on next, and what is out of scope |
| [`task-card.md`](task-card.md) | Starting a task: fill one in, keep it with the change |
| [`integration-brief.md`](integration-brief.md) | A task needs an outside service (email, SMS, push, payments, hosting) |
| [`definition-of-done.md`](definition-of-done.md) | Before calling a task finished |
| [`verifier-checklist.md`](verifier-checklist.md) | Signing off someone else's work, or having yours signed off |

The mechanical side lives in code: `scripts/check_reality.py` (no stubs, fake behaviour, swallowed errors, or
growing debt), the CI workflow `.github/workflows/ci.yml`, and the optional git hooks in `lefthook.yml`.
