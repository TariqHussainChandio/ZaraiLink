# Admin bootstrap runbook

There is no signup path to the `admin` role, and there must never be one — see finding C1 in
[`standardization-plan.md`](standardization-plan.md) §1.2 and the fix in migration
`20260922080000_role_escalation_fix.sql`. `handle_new_user()` allow-lists `farmer`, `buyer`,
`dealer`, `expert` from signup metadata; anything else, including `admin`, is stored as `buyer`.

This is the only supported way to create or promote an admin.

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

```bash
npx supabase status -o env   # prints DB_URL among other values
psql "$DB_URL" -c "
begin;
set local session_replication_role = replica;
update public.profiles set role = 'admin' where id = '<known-user-uuid>';
commit;
"
```

## Hosted project

Use `psql` with the database connection string from Project Settings → Database (the Dashboard's
SQL Editor is unverified against this exact trigger — test there first if you use it, since it may
hit the same block). Never run this from application code or a migration that ships to every
environment — a migration that hardcodes a specific user id would either fail on environments
without that user or, worse, promote the wrong id if ids ever collide across environments.

```sql
begin;
set local session_replication_role = replica;
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
- Admin MFA enrolment (TOTP, plan phase P4) should happen before the account does any admin write,
  once that phase lands — until then, protect the credentials for this account like any other
  high-privilege secret.
- Every admin write is audit-logged (BR-15) regardless of how the account was created, so
  subsequent actions are traceable even though the promotion step itself is not.
