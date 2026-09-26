"""Mutation check for the pgTAP policy suite (P6): prove every row-level-security policy is actually tested.

For each policy in the local database this replays the pgTAP files with that one policy broken, twice:
  - fail-open:   the policy's USING / WITH CHECK is replaced by `true`;
  - fail-closed: the policy is dropped.
A policy whose breakage no test notices ("survives") has no meaningful allowed-and-rejected case. The mutation
is the first statement inside each test's own transaction, so it is rolled back with the test: the database is
never left changed.

LOCAL STACK ONLY: it talks to the supabase_db_ZaraiLink_V1 container. Usage (from the repository root):
    python scripts/db/policy_mutation.py            # every policy
    python scripts/db/policy_mutation.py orders     # policies whose table or name contains "orders"
Exit status is 1 if any mutation survives.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TESTS = ROOT / "supabase" / "tests"
CONTAINER = "supabase_db_ZaraiLink_V1"


def psql(sql: str, stdin: str | None = None) -> str:
    args = ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=0"]
    if stdin is None:
        args += ["-c", sql]
    result = subprocess.run(args, input=stdin, capture_output=True, text=True, encoding="utf-8", check=False)
    return result.stdout


def policies() -> list[dict]:
    out = psql(
        "select json_agg(json_build_object('schema', schemaname, 'table', tablename, 'name', policyname, "
        "'cmd', cmd, 'qual', coalesce(qual, '')) order by schemaname, tablename, policyname) "
        "from pg_policies where schemaname in ('public','storage')"
    )
    return json.loads(out)


def fail_open_sql(p: dict) -> str:
    target = f'"{p["name"]}" on {p["schema"]}.{p["table"]}'
    if p["cmd"] == "INSERT":
        return f"alter policy {target} with check (true);"
    if p["cmd"] in ("SELECT", "DELETE"):
        return f"alter policy {target} using (true);"
    return f"alter policy {target} using (true) with check (true);"


def prepared_tests() -> list[tuple[str, str]]:
    """Each test file with the helper include inlined (psql reads it from the container's /tmp)."""
    subprocess.run(
        ["docker", "cp", str(TESTS / "helpers" / "rls_helpers.inc"), f"{CONTAINER}:/tmp/rls_helpers.inc"],
        check=True,
        capture_output=True,
    )
    files = []
    for path in sorted((TESTS / "database").glob("*.test.sql")):
        if path.name.startswith("01_"):
            continue  # structure file: its policy inventory would flag any drop, which proves nothing
        text = path.read_text(encoding="utf-8")
        text = re.sub(r"\\ir .*rls_helpers\.inc", r"\\i /tmp/rls_helpers.inc", text)
        files.append((path.name, text))
    return files


def failures(files: list[tuple[str, str]], mutation: str | None) -> list[str]:
    failed = []
    for name, text in files:
        sql = text.replace("begin;", "begin;\n" + mutation, 1) if mutation else text
        out = psql("", stdin=sql)
        bad = [line for line in out.splitlines() if line.startswith("not ok")]
        if bad:
            failed.append(f"{name}: {len(bad)}")
    return failed


def main() -> int:
    needle = sys.argv[1] if len(sys.argv) > 1 else ""
    files = prepared_tests()
    clean = failures(files, None)
    if clean:
        print("The suite fails without any mutation; fix it first:", clean)
        return 2
    survivors = []
    chosen = [p for p in policies() if needle in p["table"] or needle in p["name"]]
    for p in chosen:
        mutations = [("fail-closed", f'drop policy "{p["name"]}" on {p["schema"]}.{p["table"]};')]
        if not (p["cmd"] == "SELECT" and p["qual"].strip() == "true"):
            # A select policy that is already `true` has no fail-open mutant: replacing it changes nothing.
            mutations.insert(0, ("fail-open", fail_open_sql(p)))
        for label, mutation in mutations:
            hit = failures(files, mutation)
            status = "killed" if hit else "SURVIVED"
            print(f'{status:9} {label:11} {p["schema"]}.{p["table"]}.{p["name"]}')
            if not hit:
                survivors.append(f'{label} {p["schema"]}.{p["table"]}.{p["name"]}')
    print(f"\n{len(chosen)} policies, {len(survivors)} surviving mutations")
    for s in survivors:
        print("  ", s)
    return 1 if survivors else 0


if __name__ == "__main__":
    sys.exit(main())
