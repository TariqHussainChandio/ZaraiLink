"""CI gate: Supabase database advisors (splinter) against the local stack (P6 item 2).

Runs `supabase db advisors --local --type all --level info` and fails on:
  - any finding at WARN or ERROR, and
  - any `unindexed_foreign_keys` finding (INFO in the tool, but a real performance defect here),
except the findings listed in ALLOWED, each with the reason it is accepted. Everything else at INFO is
printed and ignored: `unused_index` in particular says nothing on a freshly built, empty database.

An allow-list entry that no longer matches anything also fails, so an exception cannot outlive its cause.

Usage: python scripts/ci/check_advisors.py [--from-file advisors.json]
"""

import json
import shutil
import subprocess
import sys

# (lint name, schema-qualified object) -> why it is accepted.
ALLOWED: dict[tuple[str, str], str] = {
    ("security_definer_view", "public.profiles_public"): (
        "Deliberate: the view exposes only id, full_name and avatar_url of every profile so one user can see "
        "another's name (order, chat and review embeds) without opening the profiles table, whose policy allows "
        "own row or admin only. Making it security_invoker would return no rows to anyone but the owner."
    ),
}
ALWAYS_FAIL_AT_INFO = {"unindexed_foreign_keys"}
IGNORED = {"unused_index"}


def run_advisors() -> list[dict]:
    # CI has the CLI on PATH; a Windows checkout reaches it through npx (npm's extensionless shim is not runnable).
    supabase = None if sys.platform == "win32" else shutil.which("supabase")
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    cli = [supabase] if supabase else [npx, "--yes", "supabase"]
    result = subprocess.run(
        [*cli, "db", "advisors", "--local", "--type", "all", "--level", "info"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    return parse(result.stdout)


def parse(text: str) -> list[dict]:
    """The CLI prints a progress line before the JSON document, and some versions a second document after it."""
    start = text.find("{")
    if start < 0:
        raise SystemExit(f"no JSON in the advisor output:\n{text}")
    document, _ = json.JSONDecoder().raw_decode(text, start)
    return document["results"]


def subject(finding: dict) -> str:
    meta = finding.get("metadata") or {}
    return f'{meta.get("schema", "public")}.{meta.get("name", "?")}'


def evaluate(findings: list[dict]) -> tuple[list[str], list[str]]:
    """Returns (problems, notes)."""
    problems, notes, used = [], [], set()
    for f in findings:
        key = (f["name"], subject(f))
        if key in ALLOWED:
            used.add(key)
            notes.append(f"accepted   {key[0]} {key[1]}")
            continue
        if f["name"] in IGNORED:
            continue
        if f["level"] in ("WARN", "ERROR") or f["name"] in ALWAYS_FAIL_AT_INFO:
            problems.append(f'{f["level"]:5} {f["name"]}: {f["detail"]}')
        else:
            notes.append(f'info       {f["name"]}: {f["detail"][:110]}')
    for key in ALLOWED:
        if key not in used:
            problems.append(f"stale allow-list entry (no such finding any more): {key}")
    return problems, notes


def main(argv: list[str]) -> int:
    if len(argv) == 3 and argv[1] == "--from-file":
        findings = parse(open(argv[2], encoding="utf-8").read())
    else:
        findings = run_advisors()
    problems, notes = evaluate(findings)
    for line in notes:
        print(line)
    for line in problems:
        print("FAIL", line)
    print(f"{len(findings)} advisor findings, {len(problems)} not accepted")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
