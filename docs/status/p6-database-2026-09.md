# P6 database standardization: what was measured, changed and proven (2026-09-24)

All numbers come from the local Supabase stack (Postgres 17.6, CLI 2.115.0). Nothing here touched the hosted
project. Every change is a new forward migration; none of the 45 existing migrations was edited.

## Starting point (advisors, empty database)

`supabase db advisors --local --type all --level info`: **1 ERROR, 127 WARN, 53 INFO** (37 `unused_index`, which only reflects an empty database, and 16 unindexed foreign keys)

| Finding | Count |
|---|---|
| `auth_rls_initplan`: a policy calls `auth.uid()` or an `is_*` helper once per row | 57 across 27 tables |
| `multiple_permissive_policies`: two permissive policies for one command | 70 across 14 tables |
| `security_definer_view` (`profiles_public`) | 1 ERROR |
| `unindexed_foreign_keys` | 16 |

Also found by reading the live catalog: 92 policies, 58 of them with a bare `auth.uid()`; about 54 `is_admin()`,
54 `is_suspended()` and 12 `is_admin_aal2()` calls unwrapped; every table has RLS.

## Changes (migrations `20260926080000` to `20260926080500`)

| Migration | What |
|---|---|
| `rls_initplan_wrap` | 83 policies rewritten with `alter policy`, calls wrapped as `(select ...)`. Generated from `pg_policies`, not typed. Proof the rule is unchanged: un-wrapping the new definitions reproduces all 92 old definitions exactly (0 differences) |
| `merge_permissive_policies` | 12 `for all` write policies split into insert, update and delete; two update policies on `messages` and two select policies on `payment_transactions` merged with `or`. The unreachable `farmer_profiles` delete policy (no DELETE grant) is not recreated |
| `fk_indexes` | 16 foreign-key indexes, one composite `messages (conversation_id, created_at)` replacing a single-column index, two redundant indexes dropped |
| `function_hardening` | `pg_temp` on the four helper functions; execute revoked from clients on trigger functions and from anon on the stock functions; the `is_*` helpers stay executable by anon because policies call them as the querying role |
| `revoke_excess_table_privileges` | **Found by the pgTAP suite.** The migration role's default privileges gave `anon`, `authenticated` and `service_role` TRUNCATE, REFERENCES and TRIGGER on all 33 tables (and the view). TRUNCATE ignores RLS. Revoked, and the default privileges changed for future tables |
| `revoke_maintain_privilege` | Also removes the Postgres 17 MAINTAIN privilege (VACUUM, ANALYZE, REINDEX, CLUSTER, LOCK) from the same roles, guarded by a version check. Found by the independent verification; not reachable through the Data API, so tidying rather than a hole |

Advisors afterwards: `profiles_public` (accepted, see below) and 30 `unused_index` INFO findings that only reflect an
empty database. No WARN, no unindexed foreign key.

`profiles_public` stays `security definer` on purpose: it exposes only id, name and avatar so users can see each
other's names in orders, chats and reviews. As `security_invoker` it would return nothing to anyone but the owner,
because the `profiles` policy allows own row or admin only. It is the single allow-listed entry in
`scripts/ci/check_advisors.py`.

## Before and after (`EXPLAIN (ANALYZE)`, best of four)

Data: 2,000 users, 20,000 listings, 60,000 orders with 120,000 items, 3,000 conversations with 180,000
messages, 150,000 notifications, loaded by `scripts/db/explain-bench-load.sql` (disposable, local stack only). The
same rows were measured before and after applying the migrations. Each query runs as a real signed-in role.

| Query | Before | After | Faster |
|---|---|---|---|
| Orders, buyer view (newest 50) | 758.3 ms | 4.9 ms | 156x |
| Order items visible to the buyer (policy joins orders) | 768.7 ms | 15.5 ms | 50x |
| All messages visible to a seller (policy joins conversations) | 1995.6 ms | 20.7 ms | 97x |
| Marketplace browse as anon (newest 20 active listings) | 98.0 ms | 7.4 ms | 13x |
| Chat history of one conversation (newest 50) | 6.7 ms | 0.7 ms | 9x |
| Orders, seller view | 0.6 ms | 0.3 ms | 2x |
| Notifications inbox (newest 50) | 0.5 ms | 0.4 ms | 1x |

The gain comes mostly from the init-plan rewrite (each policy check ran once per row before, once per query now).
Scale matters: at a few hundred rows none of this shows.

## Proof

- **pgTAP** (`supabase/tests/database`, `npx supabase test db`): 383 assertions in six files. `01_structure` checks RLS on every
  table, no per-row calls in policies, `search_path` on definer functions, an index on every foreign key, explicit
  grants, no client TRUNCATE, BR-09 (`orders.total` generated), BR-10 (no logistics tables), BR-11 (no escrow
  columns), and holds the inventory of all 113 policies. `02` to `05` run allowed and rejected statements as real
  roles (farmer, buyer, dealer, expert, suspended, admin without and with a second factor, anon) for every table and
  storage bucket. `06_grants_functions_triggers` (added after the independent verification) holds two reviewed
  allow-lists (table grants for anon, authenticated and service_role including MAINTAIN, and which functions each role can
  execute), fixes the `profiles_public` column list, probes profiles as every stranger role, and exercises the payment,
  message and expert-verification guard triggers and eight of the nine notification triggers (the inventory low-stock
  trigger is not covered by pgTAP). The suite is hermetic: it passes on an empty database and on one already filled by
  the API tests.
- **Mutation check** (`scripts/db/policy_mutation.py`): replays the suite with each of the 113 policies broken, once
  made fail-open and once dropped. First run: 26 mutations survived, each a real gap (no suspended-owner case, no
  delete case, a dead policy). After closing them: **0 survivors**. The same script found that the policy suite never
  exercised a suspended owner writing, which is why the suspended-user fixtures exist.
- **Structure mutations**: 14 deliberate violations (bare `auth.uid()`, unindexed foreign key, definer without
  `search_path`, an escrow column, a TRUNCATE grant, and others) were each caught.
- **Realtime** (`test_smoke_realtime_rls.py`): with real WebSocket subscriptions, a message, a notification and a
  consultation message reach their participants and not a stranger or anon. Mutation: opening the messages select
  policy made the test fail, so Realtime delivery is governed by RLS. The app uses only `postgres_changes`; there is no
  broadcast, presence or private channel to secure.
- **Real stack regression**: the whole API suite (223 tests, then the 3 Realtime tests added) passes on the migrated database, so no
  API behaviour changed.
- **Backup and restore drill** (`scripts/db/backup.sh`, `restore-drill.sh`), local: a 23 MB age-encrypted dump (no
  plaintext) restored into a scratch Postgres; all 66 tables in `public`, `auth` and `storage` (537,804 rows) match the source by row count AND by a checksum of
  the rows' contents, and the 113 policy definitions and 25 public functions match by checksum. Fails on a wrong or
  corrupt key, a changed policy rule with the same name, and 5 changed values among 60,024 rows (the first version compared
  counts only, which the verifier showed a restore with wrong values could pass).
- **Gates**: `scripts/ci/check_advisors.py` (fails on WARN or an unindexed foreign key; a stale allow-list entry also
  fails), `scripts/check_migrations.py` (RLS, grants, wrapped `auth.uid()`, indexes, `search_path`, a paired pgTAP file,
  for migrations from version 20260926090000 on, with 36 unit tests that plant each violation; it also rejects `grant all`, anon writes, unconditional write policies, tables built in DO blocks and bare helper calls in `alter policy`), `scripts/gen_schema_docs.py --check`
  (a stale `docs/database/schema.md` fails CI).

## Deviations and limits

- **Storage policies** are not merged (the advisor does not flag them) and are proven per bucket instead.
- **Anon listing storage through SQL fails** rather than returning no rows, because the private buckets' select
  policies read tables anon has no grant on. Public buckets are served by the Storage API's public URL, which does not
  use these policies, so nothing user-facing depends on it. Recorded in the test.
- **Direct deletes on `storage.objects`** are blocked by Storage's own trigger unless the API sets a flag; the suite
  sets that flag to test the delete policies.
- **Backups are not live.** They need the maintainer's key and connection string (`docs/process/briefs/g3-backup.md`),
  so the register keeps them `Blocked`. The backup covers the database only: uploaded files are not in it.
- **G3 (a staging project) is not created.** Migrations, pgTAP and advisors run against the local stack, which CI
  also uses.
- The pgTAP CI steps and the drift check have not yet run on GitHub Actions.
- **Equivalent mutants:** replacing the WITH CHECK of the `notifications`, `consultations` and `payments` update
  policies with `true` changes nothing observable, because Postgres also applies the table's select policy to the new row
  of an update and those select policies already require ownership. The suite explains this rather than testing it.
- **Migration checker limits:** it reads text, not SQL, and looks only inside one migration on purpose (a new table's
  RLS, grants and indexes must be in the migration that creates it). It cannot see SQL built at run time.
- **Default privileges of `supabase_admin`** (the role Supabase's own services use to create objects) still grant broad
  rights on tables that role creates. Our migrations run as `postgres`, whose defaults are now tightened.
