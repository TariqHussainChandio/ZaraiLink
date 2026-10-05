"""Tests for scripts/check_migrations.py: planted violations must fail, the template must pass.

    python -m pytest scripts/test_check_migrations.py
"""

import importlib.util
import textwrap
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("check_migrations", SCRIPTS / "check_migrations.py")
check = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(check)

GOOD = textwrap.dedent(
    """
    create table public.things (
      id uuid primary key default gen_random_uuid(),
      owner_id uuid not null references public.profiles (id) on delete cascade
    );
    alter table public.things enable row level security;
    grant select, insert on public.things to authenticated;
    create index things_owner_id_idx on public.things (owner_id);
    create policy "things_owner" on public.things for select using (owner_id = (select auth.uid()));
    create function public.tidy() returns void language sql security definer
      set search_path = public, pg_temp as $$ select 1 $$;
    """
)


def problems(sql: str) -> list[str]:
    return check.check_sql(sql)


def test_a_correct_migration_passes():
    assert problems(GOOD) == []


def test_the_shipped_template_passes():
    template = (SCRIPTS.parent / "supabase" / "migrations" / "_template.sql.example").read_text(encoding="utf-8")
    assert problems(template) == []


@pytest.mark.parametrize(
    ("broken", "expected"),
    [
        (GOOD.replace("alter table public.things enable row level security;", ""), "row-level security"),
        (GOOD.replace("grant select, insert on public.things to authenticated;", ""), "GRANT"),
        (GOOD.replace("(select auth.uid())", "auth.uid()"), "bare auth.uid()"),
        (GOOD.replace("create index things_owner_id_idx on public.things (owner_id);", ""), "no index"),
        (GOOD.replace("set search_path = public, pg_temp", ""), "search_path"),
    ],
    ids=["no-rls", "no-grant", "bare-auth-uid", "unindexed-fk", "definer-without-search-path"],
)
def test_each_planted_violation_is_reported(broken, expected):
    found = problems(broken)
    assert found, "the violation went unnoticed"
    assert any(expected in p for p in found), found


def test_comments_do_not_count():
    commented = GOOD.replace("grant select, insert on public.things to authenticated;", "-- grant select on public.things to authenticated;")
    assert any("GRANT" in p for p in problems(commented))


def repo(tmp_path: Path, version: str, sql: str, with_test: bool) -> Path:
    (tmp_path / "supabase" / "migrations").mkdir(parents=True)
    (tmp_path / "supabase" / "tests" / "database").mkdir(parents=True)
    (tmp_path / "supabase" / "migrations" / f"{version}_x.sql").write_text(sql, encoding="utf-8")
    if with_test:
        (tmp_path / "supabase" / "tests" / "database" / f"{version}_x.test.sql").write_text("select 1;", encoding="utf-8")
    return tmp_path


def test_a_new_table_without_a_paired_pgtap_file_fails(tmp_path):
    found = check.check_repository(repo(tmp_path, "20261001000000", GOOD, with_test=False))
    assert any("paired pgTAP" in p for p in found)


def test_a_new_table_with_its_pgtap_file_passes(tmp_path):
    assert check.check_repository(repo(tmp_path, "20261001000000", GOOD, with_test=True)) == []


def test_old_migrations_are_grandfathered(tmp_path):
    assert check.check_repository(repo(tmp_path, "20260901000000", "create table public.old (id int);", with_test=False)) == []


# Cases the independent verification showed the first version of the checker missed or mis-flagged.
ONE_LINE = "create table public.t (id uuid primary key, owner_id uuid references public.profiles (id)); grant select on public.t to authenticated;"


@pytest.mark.parametrize(
    ("broken", "expected"),
    [
        (ONE_LINE, "row-level security"),
        (ONE_LINE + " alter table public.t enable row level security;", "no index"),
        (
            "do $$ begin execute 'create table public.t (id int)'; end $$; create table public.x (id int primary key);",
            "DO block",
        ),
        (GOOD + " grant all on public.things to anon;", "grant all"),
        (GOOD + " grant insert on public.things to anon;", "anon may only be given select"),
        (GOOD + ' create policy "open" on public.things for all using (true);', "unconditional write"),
        (GOOD + ' create policy "open2" on public.things for insert with check (true);', "unconditional write"),
        (GOOD + " alter table public.things add column other_id uuid references public.profiles (id);", "no index"),
        (
            GOOD + " alter table public.things add constraint t_fk foreign key (owner_id) references public.profiles (id);"
            .replace("owner_id", "region_id"),
            "no index",
        ),
        (GOOD + ' alter policy "things_owner" on public.things using (owner_id = auth.uid());', "bare"),
        (GOOD + ' create policy "admin" on public.things for select using (public.is_admin());', "bare"),
        (GOOD + """ create policy "jwt" on public.things for select using (auth.jwt() ->> 'role' = 'x');""", "bare"),
        # A3a's account-status helpers run once per statement too.
        (GOOD + ' create policy "ap" on public.things for insert with check (public.is_account_approved());', "bare"),
        (GOOD + ' create policy "ad" on public.things for insert with check (is_approved_dealer());', "bare"),
        (GOOD + ' create policy "ae" on public.things for update using (public.is_approved_expert());', "bare"),
        (GOOD + """ create policy "cr" on public.things for insert with check (public.caller_role() = 'expert');""", "bare"),
        # A3b's application helper too.
        (GOOD + ' create policy "ed" on public.things for delete using (public.is_application_editable());', "bare"),
    ],
    ids=[
        "one-line-no-rls", "one-line-unindexed-fk", "table-in-do-block", "grant-all", "anon-insert", "for-all-true",
        "insert-check-true", "add-column-fk", "add-constraint-fk", "alter-policy-bare", "bare-is-admin", "bare-jwt",
        "bare-is-account-approved", "bare-is-approved-dealer", "bare-is-approved-expert", "bare-caller-role",
        "bare-is-application-editable",
    ],
)
def test_the_gaps_found_by_verification_are_closed(broken, expected):
    found = problems(broken)
    assert any(expected in p for p in found), found


@pytest.mark.parametrize(
    "fine",
    [
        GOOD.replace("(select auth.uid())", "( select auth.uid() as uid )"),
        GOOD.replace("set search_path = public, pg_temp", "") + " alter function public.tidy() set search_path = public, pg_temp;",
        GOOD + ' create policy "admin" on public.things for select using ((select public.is_admin()));',
        GOOD + ' create policy "pub" on public.things for select using (true);',
        GOOD + " grant select on public.things to anon;",
        GOOD + """ create policy "cr" on public.things for insert with check ((select public.caller_role()) = 'expert');""",
    ],
    ids=["spaced-wrapper", "alter-function-search-path", "wrapped-helper", "select-true", "anon-select", "wrapped-caller-role"],
)
def test_valid_sql_is_not_flagged(fine):
    assert problems(fine) == []


def test_the_check_window_starts_after_the_p6_migrations():
    assert check.CHECK_FROM > "20260926080500"

