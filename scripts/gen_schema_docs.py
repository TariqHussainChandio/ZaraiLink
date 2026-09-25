"""Generate docs/database/schema.md from the live local schema (P6 item 7), so it cannot drift from the database.

Reads tables, columns, generated columns, constraints, indexes, row-level-security policies, grants, triggers,
views, enums, functions, storage buckets and the realtime publication with psql, and writes markdown. The prose
that explains WHY (purpose of each table, business rules) lives in docs/database/notes.md, written by hand.

    python scripts/gen_schema_docs.py            # rewrite docs/database/schema.md
    python scripts/gen_schema_docs.py --check    # exit 1 if the committed file differs (CI drift check)

Connection: `--db-url URL` (CI, where psql reaches the local stack directly) or, by default, the local Supabase
container through `docker exec` (a developer machine). LOCAL STACK ONLY: never point it at a real project.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "docs" / "database" / "schema.md"
CONTAINER = "supabase_db_ZaraiLink_V1"

QUERY = r"""
select json_build_object(
  'tables', (select coalesce(json_agg(t order by t->>'name'), '[]') from (
    select json_build_object(
      'name', c.relname,
      'rls', c.relrowsecurity,
      'columns', (select json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
                    'notnull', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid), 'generated', a.attgenerated) order by a.attnum)
                  from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                  where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped),
      'constraints', (select json_agg(json_build_object('name', conname, 'def', pg_get_constraintdef(oid)) order by conname)
                      from pg_constraint where conrelid = c.oid),
      'indexes', (select json_agg(pg_get_indexdef(indexrelid) order by pg_get_indexdef(indexrelid)) from pg_index where indrelid = c.oid),
      'policies', (select json_agg(json_build_object('name', policyname, 'cmd', cmd, 'using', qual, 'check', with_check) order by policyname)
                   from pg_policies where schemaname = 'public' and tablename = c.relname),
      'grants', (select json_object_agg(grantee, privs) from (
                   select grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
                   from information_schema.role_table_grants
                   where table_schema = 'public' and table_name = c.relname and grantee in ('anon', 'authenticated', 'service_role')
                   group by grantee) g),
      'triggers', (select json_agg(tgname order by tgname) from pg_trigger where tgrelid = c.oid and not tgisinternal)
    ) as t
    from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r') x),
  'views', (select coalesce(json_agg(json_build_object('name', viewname, 'def', definition) order by viewname), '[]')
            from pg_views where schemaname = 'public'),
  'enums', (select coalesce(json_object_agg(typname, labels), '{}') from (
              select t.typname, json_agg(e.enumlabel order by e.enumsortorder) as labels
              from pg_type t join pg_enum e on e.enumtypid = t.oid
              where t.typnamespace = 'public'::regnamespace group by t.typname) z),
  'functions', (select coalesce(json_agg(json_build_object('name', p.oid::regprocedure::text, 'definer', p.prosecdef,
                  'config', array_to_string(p.proconfig, ', '), 'volatility', p.provolatile, 'returns', pg_get_function_result(p.oid)) order by p.oid::regprocedure::text), '[]')
                from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'),
  'buckets', (select coalesce(json_agg(json_build_object('id', id, 'public', public, 'limit', file_size_limit,
                'mime', allowed_mime_types) order by id), '[]') from storage.buckets),
  'storage_policies', (select coalesce(json_agg(json_build_object('name', policyname, 'cmd', cmd, 'using', qual, 'check', with_check)
                        order by policyname), '[]') from pg_policies where schemaname = 'storage' and tablename = 'objects'),
  'realtime', (select coalesce(json_agg(tablename order by tablename), '[]') from pg_publication_tables where pubname = 'supabase_realtime')
);
"""


def run_query(db_url: str | None) -> dict:
    if db_url:
        cmd = ["psql", db_url, "-At", "-q", "-c", QUERY]
    else:
        cmd = ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-At", "-q"]
    result = subprocess.run(
        cmd, input=None if db_url else QUERY, capture_output=True, text=True, encoding="utf-8", check=False
    )
    if result.returncode != 0 or not result.stdout.strip():
        raise SystemExit(f"could not read the schema: {result.stderr.strip() or 'empty result'}")
    return json.loads(result.stdout)


def one_line(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def cell(text: str | None) -> str:
    return one_line(text).replace("|", "\\|")


def render(schema: dict) -> str:
    out = [
        "# Database schema",
        "",
        "<!-- GENERATED by scripts/gen_schema_docs.py from the local database. Do not edit by hand: change a migration,",
        "     run `npx supabase db reset`, then `python scripts/gen_schema_docs.py`. CI fails if this file is stale. -->",
        "",
        "What each table is for, and the business rules behind the design, are in [notes.md](notes.md).",
        "",
        f"{len(schema['tables'])} tables, {len(schema['views'])} view(s), {len(schema['enums'])} enum types, "
        f"{sum(len(t['policies'] or []) for t in schema['tables'])} row-level-security policies on tables and "
        f"{len(schema['storage_policies'])} on storage objects.",
        "",
        "Realtime publishes changes of: " + ", ".join(f"`{t}`" for t in schema["realtime"]) + ".",
        "",
        "## Tables",
        "",
    ]
    for t in schema["tables"]:
        out += [f"### `{t['name']}`", ""]
        out.append(f"Row-level security: **{'on' if t['rls'] else 'OFF'}**. Grants: " + grants_text(t["grants"]) + ".")
        out.append("")
        out += ["| Column | Type | Null | Default |", "|---|---|---|---|"]
        for c in t["columns"] or []:
            default = cell(c["default"])
            if c["generated"] == "s":
                default = f"generated always as {default} stored"
            out.append(f"| `{c['name']}` | {cell(c['type'])} | {'no' if c['notnull'] else 'yes'} | {default} |")
        out.append("")
        if t["constraints"]:
            out.append("Constraints: " + "; ".join(f"`{c['name']}`: {cell(c['def'])}" for c in t["constraints"]) + ".")
            out.append("")
        if t["indexes"]:
            out.append("Indexes:")
            out += [f"- `{cell(i)}`" for i in t["indexes"]]
            out.append("")
        if t["policies"]:
            out += ["| Policy | Command | Using | With check |", "|---|---|---|---|"]
            for p in t["policies"]:
                out.append(f"| `{p['name']}` | {p['cmd']} | {cell(p['using']) or '-'} | {cell(p['check']) or '-'} |")
            out.append("")
        if t["triggers"]:
            out.append("Triggers: " + ", ".join(f"`{n}`" for n in t["triggers"]) + ".")
            out.append("")
    out += ["## Views", ""]
    for v in schema["views"]:
        out += [f"- `{v['name']}`: `{cell(v['def'])}`"]
    out += ["", "## Enum types", ""]
    for name, labels in sorted(schema["enums"].items()):
        out.append(f"- `{name}`: " + " · ".join(labels))
    out += ["", "## Functions", "", "| Function | Returns | Security | Config |", "|---|---|---|---|"]
    for f in schema["functions"]:
        security = "definer" if f["definer"] else "invoker"
        out.append(f"| `{cell(f['name'])}` | {cell(f['returns'])} | {security} | {cell(f['config']) or '-'} |")
    out += ["", "## Storage buckets", "", "| Bucket | Public | Size limit (bytes) | Allowed types |", "|---|---|---|---|"]
    for b in schema["buckets"]:
        mime = ", ".join(b["mime"]) if b["mime"] else "any"
        out.append(f"| `{b['id']}` | {'yes' if b['public'] else 'no'} | {b['limit'] or '-'} | {mime} |")
    out += ["", "## Storage policies (`storage.objects`)", "", "| Policy | Command | Using | With check |", "|---|---|---|---|"]
    for p in schema["storage_policies"]:
        out.append(f"| `{p['name']}` | {p['cmd']} | {cell(p['using']) or '-'} | {cell(p['check']) or '-'} |")
    out.append("")
    return "\n".join(out)


def grants_text(grants: dict | None) -> str:
    if not grants:
        return "none to client roles"
    return "; ".join(f"{role}: {privs.lower()}" for role, privs in sorted(grants.items()))


def main(argv: list[str]) -> int:
    db_url = argv[argv.index("--db-url") + 1] if "--db-url" in argv else None
    text = render(run_query(db_url))
    if "--check" in argv:
        current = OUT.read_text(encoding="utf-8").replace("\r\n", "\n") if OUT.exists() else ""
        if current != text:
            print("docs/database/schema.md is stale; run: python scripts/gen_schema_docs.py")
            return 1
        print("docs/database/schema.md is up to date")
        return 0
    OUT.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {OUT} ({len(text.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
