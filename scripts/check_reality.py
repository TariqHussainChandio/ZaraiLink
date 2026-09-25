#!/usr/bin/env python3
"""Reality gate: mechanical guards for the "nothing fake, dead, or half-built" rules.

Why this exists. Earlier work shipped code that looked finished but did not work, and every
green check (tsc, eslint, jest, pytest) passed anyway. Type checks and linters cannot see stubs,
placeholder behaviour, swallowed errors, or debt that quietly grows. This script can.

Two kinds of rule, both counted per file:

  strict   Must be zero in production code. There is no baseline and no way to record an
           exception: fix it, or move it under tests.
  ratchet  Existing debt is recorded once in scripts/reality-baseline.json. A file may keep or
           lower its count, never raise it, and a new file starts at zero. Later phases burn the
           counts down; `--update-baseline` refuses to record an increase.

Optional tool ratchets (`--tools ruff,ruff-format,mypy,knip,eslint`) apply the same "may only go down"
rule to the output of the project's linters, so adopting a stricter tool never needs a
flag-day cleanup.

Standard library only, so it runs unchanged on Windows, Linux CI, and inside pre-commit hooks.

Usage
    python scripts/check_reality.py                      # full scan (CI)
    python scripts/check_reality.py --files a.ts b.py    # only these files (pre-commit)
    python scripts/check_reality.py --tools ruff,mypy    # also run tool ratchets
    python scripts/check_reality.py --update-baseline    # record improvements (never increases)
    python scripts/check_reality.py --init               # create the first baseline
    python scripts/check_reality.py --update-baseline --adopt-new-rules   # after adding a ratchet rule to RULES
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASELINE_PATH = ROOT / "scripts" / "reality-baseline.json"
BACKEND = ROOT / "backend"

TS_EXTENSIONS = (".ts", ".tsx", ".js", ".jsx")
# "/generated/": the API client generated from the OpenAPI document (P7). It is machine output, so the text rules
# (as any, console, suppressions) do not apply to it; drift is caught by regenerating and diffing in CI instead.
TS_TEST_MARKERS = (".test.", "/__tests__/", "/__mocks__/", "/testUtils/", "/generated/")


# --------------------------------------------------------------------------- rules


@dataclass(frozen=True)
class Rule:
    """One mechanical check. `patterns` maps a language ("ts" / "py") to a regex."""

    name: str
    kind: str  # "strict" or "ratchet"
    patterns: dict[str, str]
    why: str
    scope: tuple[str, ...] = ()  # path prefixes the rule applies to; empty means every production file
    exempt: tuple[str, ...] = ()  # the one or two files that are allowed to break the rule by design


RULES: tuple[Rule, ...] = (
    # ---- strict: production code must never contain these --------------------------------
    Rule(
        "stub-marker",
        "strict",
        {
            "ts": r"(?i)\b(?:not implemented|coming soon|lorem ipsum|stubbed?)\b",
            "py": r"(?i)\b(?:not implemented|coming soon|lorem ipsum|stubbed?)\b|\bNotImplemented(?:Error)?\b",
        },
        "unfinished or fake behaviour in a production path; finish it or do not ship the entry point",
    ),
    Rule(
        "todo-without-issue",
        "strict",
        {
            "ts": r"\b(?:TODO|FIXME|HACK|XXX)\b(?!\(#\d+\))",
            "py": r"\b(?:TODO|FIXME|HACK|XXX)\b(?!\(#\d+\))",
        },
        "an untracked promise; write TODO(#123) with a real issue number, or do the work",
    ),
    Rule(
        "empty-catch",
        "strict",
        {
            "ts": r"catch\s*(?:\([^)]*\))?\s*\{\s*\}",
            "py": r"except[^\n:]*:[ \t]*\n[ \t]*pass\b",
        },
        "a swallowed error hides exactly the failures this project keeps getting bitten by",
    ),
    Rule(
        "ts-suppression",
        "strict",
        {"ts": r"@ts-(?:ignore|nocheck|expect-error)"},
        "silences the type checker; fix the type instead",
    ),
    Rule(
        "test-double-in-prod",
        "strict",
        {
            "ts": r"\bjest\.(?:fn|mock|spyOn|requireActual)\b",
            "py": r"\bunittest\.mock\b|\bMagicMock\b|\bAsyncMock\b|\bmonkeypatch\b",
        },
        "a mock in production code means a feature is faked",
    ),
    Rule(
        "py-print",
        "strict",
        {"py": r"(?m)^[ \t]*print\("},
        "use the logger; print() leaks into responses and hides in production logs",
    ),
    Rule("as-any", "strict", {"ts": r"\bas any\b"}, "an unchecked cast; use a real type"),
    Rule(
        "layer-boundary",
        "strict",
        # `from '...'`, a bare `import '...'`, `require('...')` and `import('...')`, for the service modules, the Supabase client (with or
        # without a file after the folder) and the API client. `services/api/errors` (types only) stays allowed.
        {"ts": r"(?:(?:from|import)\s+|(?:require|import)\(\s*)['\"][^'\"]*services/(?:modules|supabase|api/client(?:\.[a-z]+)?)(?:/[^'\"]*)?['\"]"},
        "screens and components read and write through the hooks in src/hooks/api, never the service or Supabase "
        "layer directly, so caching, offline behaviour and error handling live in one place",
        scope=("src/screens/", "src/components/"),
    ),
    Rule(
        "console-call",
        "strict",
        {"ts": r"\bconsole\.(?:log|info|warn|error|debug)\("},
        "use the logger in src/utils/logger.ts, so what reaches a log is decided in one place",
        exempt=("src/utils/logger.ts",),
    ),
    Rule(
        "empty-handler",
        "strict",
        {"ts": r"=>\s*\{\s*\}"},
        "a handler that does nothing is a dead control; remove it or make it do something",
    ),
    # ---- ratchet: existing debt may shrink, never grow --------------------------------------
    Rule(
        "lint-disable",
        "ratchet",
        {"ts": r"eslint-disable", "py": r"#\s*(?:noqa|type:\s*ignore)"},
        "every suppression is a rule someone decided to stop following",
    ),
    Rule(
        "broad-except",
        "ratchet",
        {"py": r"except\s+(?:Exception|BaseException)\b|except\s*:"},
        "catches everything, including bugs; catch the specific error",
    ),
)


# --------------------------------------------------------------------------- file discovery


def candidate_files() -> list[tuple[str, str]]:
    """Return (posix_path, language) for every production source file.

    Uses git so `.gitignore` is honoured (node_modules, .venv, build output) and brand-new,
    not-yet-committed files are still scanned.
    """
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
        encoding="utf-8",
    ).stdout.splitlines()
    files: list[tuple[str, str]] = []
    for path in out:
        lang = classify(path)
        if lang and (ROOT / path).is_file():
            files.append((path, lang))
    return files


def classify(path: str) -> str | None:
    """Language of a production file, or None for tests, docs, generated files, and everything else."""
    p = "/" + path
    if path.startswith("backend/app/") and path.endswith(".py"):
        return "py"
    in_scope = path.startswith("src/") or path in ("App.tsx", "index.js")
    if in_scope and path.endswith(TS_EXTENSIONS) and not path.endswith(".d.ts"):
        if any(marker in p for marker in TS_TEST_MARKERS):
            return None
        return "ts"
    return None


# --------------------------------------------------------------------------- scanning


def scan(files: list[tuple[str, str]]) -> tuple[dict[str, Counter], dict[str, list[tuple[str, int, str]]]]:
    """Count matches per rule per file, and remember locations (used to explain strict failures)."""
    counts: dict[str, Counter] = {r.name: Counter() for r in RULES}
    where: dict[str, list[tuple[str, int, str]]] = {r.name: [] for r in RULES}
    for path, lang in files:
        text = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        for rule in RULES:
            pattern = rule.patterns.get(lang)
            if not pattern or (rule.scope and not path.startswith(rule.scope)) or path in rule.exempt:
                continue
            for match in re.finditer(pattern, text, flags=re.MULTILINE):
                line_no = text.count("\n", 0, match.start()) + 1
                line = text.splitlines()[line_no - 1].strip() if text else ""
                counts[rule.name][path] += 1
                where[rule.name].append((path, line_no, line[:120]))
    return counts, where


# --------------------------------------------------------------------------- tool ratchets


def _run_module(module: str, *args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", module, *args], cwd=cwd, capture_output=True, text=True, encoding="utf-8"
    )


def tool_counts(tool: str) -> Counter:
    """Run one linter and return {"<category>:<file>": count}.

    Keying by file as well as category means fixing one file cannot hide a new problem in another,
    the same guarantee the text rules give. Categories are rule codes (ruff), error codes (mypy),
    or knip issue types.
    """
    counts: Counter = Counter()
    if tool == "ruff":
        proc = _run_module("ruff", "check", ".", "--output-format", "json", "--exit-zero", cwd=BACKEND)
        for item in json.loads(proc.stdout or "[]"):
            rel = Path(item["filename"]).resolve().relative_to(BACKEND).as_posix()
            counts[f"{item['code'] or 'syntax'}:{rel}"] += 1
    elif tool == "ruff-format":
        # Concise output is one line per file: "path:line:col: unformatted: File would be reformatted".
        proc = _run_module("ruff", "format", "--check", "--output-format", "concise", ".", cwd=BACKEND)
        for path in re.findall(r"^(.+?):\d+:\d+: unformatted", proc.stdout + proc.stderr, flags=re.M):
            counts[f"unformatted:{path.replace(chr(92), '/')}"] += 1
    elif tool == "mypy":
        proc = _run_module("mypy", cwd=BACKEND)
        for path, code in re.findall(r"^(.+?):\d+: error: .*\[([a-z-]+)\]\s*$", proc.stdout, flags=re.M):
            counts[f"{code}:{path.replace(chr(92), '/')}"] += 1
    elif tool == "knip":
        counts = knip_counts()
    elif tool == "eslint":
        counts = eslint_counts()
    else:
        raise SystemExit(f"unknown tool: {tool}")
    return counts


def eslint_counts() -> Counter:
    """ESLint warnings and errors, keyed by rule and file. Errors already fail `npm run lint`; counting
    warnings too stops them from quietly piling up."""
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    proc = subprocess.run(
        [npx, "--no-install", "eslint", ".", "--format", "json"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if not proc.stdout.strip():
        raise SystemExit(f"eslint produced no output: {proc.stderr[:500]}")
    counts: Counter = Counter()
    for result in json.loads(proc.stdout):
        rel = Path(result["filePath"]).resolve().relative_to(ROOT).as_posix()
        for message in result["messages"]:
            counts[f"{message['ruleId'] or 'parse-error'}:{rel}"] += 1
    return counts


def knip_counts() -> Counter:
    """Dead-code findings from knip (unused files, dependencies, exports, types), keyed by type and file."""
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    proc = subprocess.run(
        [npx, "--no-install", "knip", "--reporter", "json", "--no-exit-code"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    if not proc.stdout.strip():
        raise SystemExit(f"knip produced no output: {proc.stderr[:500]}")
    counts: Counter = Counter()
    for issue in json.loads(proc.stdout).get("issues", []):
        for category, items in issue.items():
            # "file" is the path itself and "owners" is CODEOWNERS metadata, neither is a finding.
            if category not in ("file", "owners") and isinstance(items, list) and items:
                counts[f"{category}:{issue['file']}"] += len(items)
    return counts


# --------------------------------------------------------------------------- baseline handling


def load_baseline() -> dict:
    if BASELINE_PATH.exists():
        return json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    return {"rules": {}, "tools": {}}


def write_baseline(data: dict) -> None:
    data["_comment"] = (
        "Recorded debt for scripts/check_reality.py. Counts may only go down. "
        "Refresh with `python scripts/check_reality.py --update-baseline`; it refuses increases."
    )
    BASELINE_PATH.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- main


@dataclass
class Report:
    failures: list[str] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)
    strict_failed: bool = False  # a strict rule has hits; --init must refuse even with an empty baseline


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--files", nargs="*", help="only scan these files (pre-commit mode)")
    ap.add_argument("--tools", default="", help="comma list of tool ratchets: ruff,ruff-format,mypy,knip,eslint")
    ap.add_argument("--update-baseline", action="store_true", help="record improvements; refuses increases")
    ap.add_argument("--init", action="store_true", help="create the first baseline")
    ap.add_argument(
        "--adopt-new-rules",
        action="store_true",
        help="with --update-baseline: record the current debt of a ratchet rule that has no baseline yet "
        "(a rule added to RULES); existing rules and tool ratchets are still refused if they got worse",
    )
    args = ap.parse_args()

    baseline = load_baseline()
    new_rules = {r.name for r in RULES if r.kind == "ratchet" and r.name not in baseline["rules"]}
    if args.files is not None and args.files:
        wanted = {f.replace("\\", "/") for f in args.files}
        files = [(p, lang) for p, lang in candidate_files() if p in wanted]
        partial = True
    else:
        files = candidate_files()
        partial = False

    counts, where = scan(files)
    report = Report()
    report.lines.append(f"{'rule':<22}{'kind':<9}{'now':>6}{'baseline':>10}  status")

    for rule in RULES:
        now = sum(counts[rule.name].values())
        base_files: dict[str, int] = baseline["rules"].get(rule.name, {})
        base_total = sum(base_files.values())
        if rule.kind == "strict":
            status = "ok" if now == 0 else "FAIL"
            if now:
                report.strict_failed = True
                report.failures.append(f"[{rule.name}] {rule.why}")
                for path, line_no, text in where[rule.name][:15]:
                    report.failures.append(f"    {path}:{line_no}: {text}")
        else:
            adopting = rule.name in new_rules and args.update_baseline and args.adopt_new_rules
            worse = (
                []
                if adopting
                else [
                    (path, n, base_files.get(path, 0))
                    for path, n in counts[rule.name].items()
                    if n > base_files.get(path, 0)
                ]
            )
            status = "ok" if not worse else "FAIL"
            for path, n, was in worse:
                report.failures.append(f"[{rule.name}] {path}: {n} now, {was} allowed. {rule.why}")
        shown_base = "-" if partial else str(base_total)
        report.lines.append(f"{rule.name:<22}{rule.kind:<9}{now:>6}{shown_base:>10}  {status}")

    # ---- tool ratchets (only in full mode) ----
    wanted_tools = [t.strip() for t in args.tools.split(",") if t.strip()]
    tool_now: dict[str, dict[str, int]] = {}
    for tool in wanted_tools:
        current = tool_counts(tool)
        tool_now[tool] = dict(current)
        allowed: dict[str, int] = baseline["tools"].get(tool, {})
        worse = {k: (v, allowed.get(k, 0)) for k, v in current.items() if v > allowed.get(k, 0)}
        for k, (v, was) in worse.items():
            report.failures.append(f"[{tool}] '{k}': {v} now, {was} allowed")
        report.lines.append(
            f"{'tool:' + tool:<22}{'ratchet':<9}{sum(current.values()):>6}{sum(allowed.values()):>10}  "
            f"{'ok' if not worse else 'FAIL'}"
        )

    print("\n".join(report.lines))

    if args.init or args.update_baseline:
        if partial:
            print("\nrefusing to write a baseline from a partial scan", file=sys.stderr)
            return 2
        if args.init and BASELINE_PATH.exists():
            print("\nbaseline already exists; use --update-baseline", file=sys.stderr)
            return 2
        # --init has no baseline to compare with, so only strict hits block it; --update-baseline
        # blocks on any increase.
        blocked = report.strict_failed if args.init else bool(report.failures)
        if blocked:
            print("\nrefusing to record a baseline that is worse than the current one:", file=sys.stderr)
            print("\n".join(report.failures), file=sys.stderr)
            return 1
        new = {"rules": {}, "tools": dict(baseline["tools"])}
        for rule in RULES:
            if rule.kind == "ratchet":
                new["rules"][rule.name] = dict(sorted(counts[rule.name].items()))
        for tool, current in tool_now.items():
            new["tools"][tool] = dict(sorted((k, v) for k, v in current.items() if v))
        write_baseline(new)
        print(f"\nbaseline written to {BASELINE_PATH.relative_to(ROOT)}")
        return 0

    if report.failures:
        print("\nFAILED\n" + "\n".join(report.failures), file=sys.stderr)
        return 1
    print("\nreality gate passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
