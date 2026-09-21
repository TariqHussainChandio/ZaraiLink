# Contributing to ZaraiLink

Thank you for helping. This page is the short path from an idea to a merged change. The rules for AI coding
agents are in [`AGENTS.md`](AGENTS.md) and apply to human contributors too, because they are the same
standard: nothing is finished until a real path has been proven.

## Set up

Follow [`docs/setup/DEVELOPMENT_SETUP.md`](docs/setup/DEVELOPMENT_SETUP.md). You can run the whole stack locally
with no accounts. `npm ci` installs fast pre-commit checks; skip one commit with `LEFTHOOK=0 git commit`.

## Making a change

1. **Pick or open an issue.** Write down what "done" looks like before you write code
   ([task card](docs/process/task-card.md)).
2. **Branch** from `main`: `feat/<short-name>`, `fix/<short-name>`, or `docs/<short-name>`.
3. **Write the test first.** For a bug, watch it fail before you fix it.
4. **Prove it on the real stack.** Run the behaviour end to end against local Supabase, not only unit tests.
5. **Run the checks** listed in the README. The reality gate (`python scripts/check_reality.py`) must pass, and
   you may not raise a recorded count or add a suppression to make it pass.
6. **Open a pull request** using the template. Paste real output as evidence.

## Commit and pull request titles

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): subject`, for example
`fix(auth): reject a forged admin role at sign-up`. Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`,
`build`, `ci`, `chore`, `revert`. CI checks the pull request title.

## Rules that are easy to break

- **Migrations:** validate in the local Docker stack first. Every new table needs explicit `GRANT`s,
  row-level security, indexes on policy and foreign-key columns, `(select auth.uid())` in policies, and a policy
  test. Migrations are never edited after they have been pushed to a real project.
- **No dummy data** in a real Supabase project, ever. Use the disposable local stack.
- **No secrets in the repository.** The local demo keys printed by `supabase start` are not secrets, but nothing
  else is allowed. CI scans the full history.
- **Outside services** (email, SMS, push, payments, hosting): write an
  [Integration Brief](docs/process/integration-brief.md) and get the account provisioned first. Code that calls a
  service that does not exist yet will not be merged.
- **Business rules** BR-03/04, BR-09, BR-10, BR-11, BR-13, and BR-15 (see `AGENTS.md`) are invariants.

## Reviews

Every change needs a review by someone other than its author, using the
[verifier checklist](docs/process/verifier-checklist.md). CODEOWNERS routes reviews automatically.

## Reporting a security problem

Do not open a public issue. Follow [`SECURITY.md`](SECURITY.md).
