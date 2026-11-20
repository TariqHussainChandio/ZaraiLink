# Admin bootstrap runbook

There is no signup path to the `admin` role, and there must never be one — see finding C1 in
[`standardization-plan.md`](standardization-plan.md) §1.2 and the fix in migration
`20260922080000_role_escalation_fix.sql`. `handle_new_user()` allow-lists `farmer`, `buyer`,
`dealer`, `expert` from signup metadata; anything else, including `admin`, is stored as `buyer`.

This is the only supported way to create or promote an admin.

**There is exactly one admin (D19, `20261120080000_sole_admin_no_mfa.sql`).** The unique index `profiles_single_admin`
refuses a second admin row by any path, this runbook's included. To replace the admin, retire the old one in the same
transaction (below). The admin's name, phone, photo and address are set here, by the maintainer: the app never edits
them, and the admin changes only the password. The admin needs no second factor.

## Prerequisites

- A profile must already exist for the target user (they sign up normally first, through the app,
  as any role).
- You need the **service role** key or direct Postgres access — never the anon key, and never a
  client-facing endpoint. This is a maintainer-only, out-of-band action.

## Why a plain `UPDATE` isn't enough

`guard_profiles_role()` (`20260822085900_profiles_role_guard.sql`) blocks any role change unless
`public.is_admin()` is true, and `is_admin()` reads `auth.uid()` — which resolves to **null**
outside a PostgREST request carrying a real user JWT. That's true even for a direct `psql`
connection as the `postgres` superuser: tested against the local stack, a plain
`update public.profiles set role = 'admin' ...` from psql is rejected with `Only an admin may
change role`, the same guard that blocks a public signup from self-escalating. Triggers fire
regardless of who's connected or whether RLS is bypassed — a service-role key or superuser
connection sidesteps RLS, not triggers. The fix is a **narrow, single-statement** trigger bypass
(`session_replication_role = replica`, scoped to one transaction with `set local`), not a change
to the trigger itself — loosening `guard_profiles_role()` so a null `auth.uid()` passes would also
weaken it against any future service-role code path that touches `profiles`, not just this
intentionally out-of-band runbook.

## Local stack (Docker)

Create the login first if it does not exist locally (the Auth admin API sends no email), with the role `buyer`, then
promote it. On a local database a real-stack test run may have left a smoke admin (`smoke-…@example.test`); retire it
in the same transaction.

```bash
npx supabase status -o env   # prints DB_URL among other values
psql "$DB_URL" -c "
begin;
set local session_replication_role = replica;
update public.profiles set role = 'buyer' where role = 'admin' and id <> '<known-user-uuid>';
update public.profiles set role = 'admin', full_name = '<the admin''s name>' where id = '<known-user-uuid>';
commit;
"
```

The real-stack suite then runs as this admin when `ZARAILINK_ADMIN_EMAIL` and `ZARAILINK_ADMIN_PASSWORD` are set in the
shell for the run (never in a file): `docs/setup/DEVELOPMENT_SETUP.md`.

## Hosted project

Use `psql` with the database connection string from Project Settings → Database (the Dashboard's
SQL Editor is unverified against this exact trigger — test there first if you use it, since it may
hit the same block). Never run this from application code or a migration that ships to every
environment — a migration that hardcodes a specific user id would either fail on environments
without that user or, worse, promote the wrong id if ids ever collide across environments.

```sql
begin;
set local session_replication_role = replica;
-- One admin (D19): demote a previous admin first, if this replaces one.
update public.profiles set role = 'buyer' where role = 'admin' and id <> '<known-user-uuid>';
update public.profiles set role = 'admin' where id = '<known-user-uuid>';
commit;
```

`set local` scopes the bypass to this one transaction only — every other trigger on every other
table keeps firing normally for the rest of the session. Confirm the row you just updated is the
account you intended (`select id, full_name, role from public.profiles where id =
'<known-user-uuid>';`) before closing the session — this bypasses RLS, so there is no second check.

## After promoting

- Record who was promoted, when, and why in your own notes (not in the repo — this is exactly the
  kind of operational detail that should not become admin-account discovery material once the repo
  is public).
- The admin has no second factor (D19, which replaced P4's admin MFA): protect the password like any other
  high-privilege secret. If an earlier admin enrolled a TOTP factor, remove it
  (`delete from auth.mfa_factors where user_id = '<known-user-uuid>';`), so nothing asks for it.
- Every admin write is audit-logged (BR-15) regardless of how the account was created, so
  subsequent actions are traceable even though the promotion step itself is not.
