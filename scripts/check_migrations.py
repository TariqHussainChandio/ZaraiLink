"""Migration checker (P6 item 4): the rules every new migration must meet before it can merge.

For each migration in supabase/migrations at or after CHECK_FROM (older ones are grandfathered, and are covered as a
whole by the pgTAP suite in supabase/tests/database), this checks, statically:

  1. every `create table public.x` also enables row-level security on it, in the same migration;
  2. and grants privileges on it explicitly (from 30 Oct 2026 Supabase stops exposing new tables to the Data API by
     default, so a table with no GRANT is unreachable);
  3. no grant is broader than an app needs: no `grant all`, and nothing beyond select to `anon`;
  4. every policy, created or altered, wraps `auth.uid()`, `auth.jwt()` and the `is_*` helpers as `(select ...)` so
     they run once per statement, not once per row, and no write policy is `using (true)` / `with check (true)`;
  5. every foreign key column (inline, `foreign key (...)`, or added with `alter table ... add`), and every column a
     policy compares with the caller's id on a table created here, has an index in the migration;
  6. every SECURITY DEFINER function sets `search_path`, in its header or with a later `alter function`;
  7. tables and policies are not created inside DO blocks or `execute` strings, where this checker cannot see them;
  8. a migration that creates a table, policy or definer function has a paired pgTAP file,
     supabase/tests/database/<migration version>*.test.sql.

Everything about a new table (RLS, grants, indexes) belongs in the migration that creates it; the checker does not
look across migrations, on purpose: a reviewer should not have to. It reads SQL text with regular expressions, not a
parser, so it errs on the side of asking for the explicit form. A template that passes is
supabase/migrations/_template.sql.example.

    python scripts/check_migrations.py            # check the repository
    python scripts/check_migrations.py --root DIR # check another tree (used by the tests)
"""

import re
import sys
from pathlib import Path

CHECK_FROM = "20260926090000"  # migration versions at or after this are checked (after the P6 migrations)

IDENT = r'"?(\w+)"?'
TABLE_REF = rf'(?:"?public"?\.)?{IDENT}'
# The zero-argument helpers a policy calls, each of which must run once per statement. A3a added the account-status
# helpers (20261005080000_account_status.sql), A3b the application one (20261012080000_applications.sql).
HELPERS = (
    r"(?:auth\.uid|auth\.jwt|auth\.role|(?:public\.)?is_admin_aal2|(?:public\.)?is_admin|(?:public\.)?is_suspended"
    r"|(?:public\.)?is_account_approved|(?:public\.)?is_approved_dealer|(?:public\.)?is_approved_expert"
    r"|(?:public\.)?caller_role|(?:public\.)?is_application_editable)"
)
NOT_A_COLUMN = ("constraint", "foreign", "primary", "unique", "check")


def prepare(sql: str) -> tuple[str, list[str]]:
    """SQL with comments removed, whitespace collapsed and dollar-quoted bodies replaced by $BODY$ (returned apart)."""
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    sql = re.sub(r"--[^\n]*", " ", sql)
    bodies: list[str] = []

    def take(match: re.Match) -> str:
        bodies.append(match.group(0))
        return "$BODY$"

    sql = re.sub(r"\$(\w*)\$.*?\$\1\$", take, sql, flags=re.S)
    return re.sub(r"\s+", " ", sql), bodies


def statements(text: str) -> list[str]:
    return [s.strip() for s in text.split(";") if s.strip()]


def balanced(text: str, start: int) -> str:
    """The text between the parenthesis at `start` and its match."""
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
    return text[start + 1 :]


def split_top_level(body: str) -> list[str]:
    parts, depth, cur = [], 0, ""
    for ch in body:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def created_tables(text: str) -> dict[str, str]:
    return {
        m.group(1).lower(): balanced(text, m.end() - 1)
        for m in re.finditer(rf"create table (?:if not exists )?{TABLE_REF} \(", text, re.I)
    }


def foreign_key_columns(text: str, tables: dict[str, str]) -> list[tuple[str, str]]:
    found = []
    for table, body in tables.items():
        for part in split_top_level(body):
            m = re.match(rf"{IDENT} .* references ", part, re.I)
            if m and m.group(1).lower() not in NOT_A_COLUMN:
                found.append((table, m.group(1).lower()))
            m = re.search(r"foreign key \(([^)]*)\) references ", part, re.I)
            if m:
                found += [(table, c.strip().strip('"').lower()) for c in m.group(1).split(",")]
    for m in re.finditer(
        rf"alter table (?:only )?{TABLE_REF} add (?:column )?(?:if not exists )?{IDENT} [^;]*? references ", text, re.I
    ):
        if m.group(2).lower() not in NOT_A_COLUMN:
            found.append((m.group(1).lower(), m.group(2).lower()))
    for m in re.finditer(
        rf"alter table (?:only )?{TABLE_REF} add constraint {IDENT} foreign key \(([^)]*)\) references ", text, re.I
    ):
        found += [(m.group(1).lower(), c.strip().strip('"').lower()) for c in m.group(3).split(",")]
    return found


def is_indexed(text: str, table: str, column: str, body: str) -> bool:
    for m in re.finditer(rf'create (?:unique )?index [^;]*? on {TABLE_REF} [^;]*?\( ?"?{column}"? ?[,)]', text, re.I):
        if m.group(1).lower() == table:
            return True
    for part in split_top_level(body):
        if re.match(rf'(?:constraint {IDENT} )?(?:primary key|unique) \( ?"?{column}"? ?[,)]', part, re.I):
            return True
        if re.match(rf'"?{column}"? .*\bprimary key\b', part, re.I):
            return True
    return False


def check_sql(sql: str) -> list[str]:
    """Rule violations found in one migration's SQL (rules 1 to 7)."""
    text, bodies = prepare(sql)
    problems: list[str] = []
    tables = created_tables(text)

    if any(re.search(r"\bcreate (?:table|policy)\b", body, re.I) for body in bodies):
        problems.append("a table or policy is created inside a DO block or dynamic SQL, which this checker cannot see; use plain statements")

    rls = {m.group(1).lower() for m in re.finditer(rf"alter table (?:only )?{TABLE_REF} enable row level security", text, re.I)}
    granted = {m.group(1).lower() for m in re.finditer(rf"grant [^;]*? on (?:table )?{TABLE_REF} to ", text, re.I)}
    for table in tables:
        if table not in rls:
            problems.append(f"table {table}: row-level security is not enabled (alter table ... enable row level security)")
        if table not in granted:
            problems.append(f"table {table}: no explicit GRANT (grant select, ... on public.{table} to authenticated)")

    for table, column in foreign_key_columns(text, tables):
        if not is_indexed(text, table, column, tables.get(table, "")):
            problems.append(f"table {table}: foreign key column {column} has no index")

    wrapped = rf"\( ?select {HELPERS}\(\)(?: ?-?>>? ?'[^']*')?(?: as \w+)? ?\)"
    for stmt in statements(text):
        m = re.match(rf'(create|alter) policy "?([\w-]+)"? on {TABLE_REF}(.*)', stmt, re.I)
        if not m:
            continue
        verb, policy, table, rest = m.group(1).lower(), m.group(2), m.group(3).lower(), m.group(4)
        if re.search(rf"{HELPERS}\(\)", re.sub(wrapped, "", rest, flags=re.I), re.I):
            problems.append(f"policy {policy}: a bare auth.uid()/auth.jwt()/is_*() call; write it as (select ...)")
        if re.search(r"(?:using|with check) \( ?true ?\)", rest, re.I) and not re.search(r" for select\b", rest, re.I):
            problems.append(f"policy {policy}: unconditional write (using/with check true)")
        if verb == "create" and table in tables:
            for col in re.findall(r"(\w+) = \( ?select auth\.uid\(\)", rest, re.I):
                if not is_indexed(text, table, col.lower(), tables[table]):
                    problems.append(f"policy {policy}: column {table}.{col} compared with the caller has no index")

    for stmt in statements(text):
        m = re.match(r"grant (.*?) on (.*?) to (.*)", stmt, re.I)
        if not m:
            continue
        privs, target, roles = m.group(1).lower(), m.group(2), m.group(3).lower()
        if re.search(r"\ball\b", privs):
            problems.append(f"grant all on {target}: grant only the privileges the app uses")
        if re.search(r"\banon\b", roles) and re.search(r"insert|update|delete|truncate|references|trigger|maintain", privs):
            problems.append(f"grant to anon on {target}: anon may only be given select")

    altered = {
        m.group(1).lower().replace('"', "")
        for m in re.finditer(r"alter function ([\w.\"]+)[^;]*? set search_path", text, re.I)
    }
    for m in re.finditer(r"create (?:or replace )?function ([\w.\"]+)", text, re.I):
        rest = text[m.end() :]
        body_start = re.search(r"\bas \$BODY\$|\bas '", rest, re.I)
        header = rest[: body_start.start()] if body_start else rest
        name = m.group(1).lower().replace('"', "")
        if re.search(r"security definer", header, re.I) and not re.search(r"set search_path", header, re.I) and name not in altered:
            problems.append(f"function {m.group(1)}: SECURITY DEFINER without set search_path")
    return problems


def needs_pgtap(sql: str) -> bool:
    text, bodies = prepare(sql)
    return bool(
        re.search(r"create table ", text, re.I)
        or re.search(r"create policy ", text, re.I)
        or re.search(r"security definer", text, re.I)
        or any(re.search(r"create (?:table|policy)", b, re.I) for b in bodies)
    )


def check_repository(root: Path) -> list[str]:
    problems = []
    for path in sorted((root / "supabase" / "migrations").glob("*.sql")):
        version = path.name.split("_", 1)[0]
        if version < CHECK_FROM:
            continue
        sql = path.read_text(encoding="utf-8")
        found = check_sql(sql)
        if needs_pgtap(sql) and not list((root / "supabase" / "tests" / "database").glob(f"{version}*.test.sql")):
            found.append(f"no paired pgTAP file supabase/tests/database/{version}*.test.sql")
        problems += [f"{path.name}: {p}" for p in found]
    return problems


def main(argv: list[str]) -> int:
    root = Path(argv[2]) if len(argv) == 3 and argv[1] == "--root" else Path(__file__).resolve().parents[1]
    problems = check_repository(root)
    for p in problems:
        print("FAIL", p)
    print(f"migration checker: {len(problems)} problem(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
