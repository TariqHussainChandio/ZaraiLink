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
import functools
import json
import re
import subprocess
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import NamedTuple

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
    # The one or two files allowed to break the rule by design; an entry ending in "/" exempts a whole folder.
    exempt: tuple[str, ...] = ()
    # Path segments the rule applies to wherever they occur (A1 put screens and components inside every module).
    scope_segments: tuple[str, ...] = ()


# raw-style: the ternaries and fallbacks in front of a literal, on one line: `big ? 18 : 14`, `on ? colors.ink : 'red'`,
# `size ?? 14`, `dense && 8`, `Platform.OS === 'ios' ? 12 : 8`, nested ones too. It is a small grammar rather than a run
# of any characters: a condition is one operand (a name, a member or index access, a number or a string), perhaps
# compared with another, then `?`, `??`, `||` or `&&`. So a literal inside an index (`space[dense ? 1 : 2]`), a call
# (`scale(dense ? 1 : 2)`), arithmetic, a typed declaration (`const end: number = more ? 1 : 0`), a parameter list or
# a time ('09:00') is never read as a branch.
# Every line has one parse, so a match from one rule key stays linear in its operators: spaces come only before a piece,
# never after one (two `[ \t]*` side by side could share a run of spaces, doubling the work at each step), and `!` only
# starts an operand (otherwise `a!==b` reads as `a!` `==` or as `a` `!==`).
_OPERAND = r"!*(?:[\w.$]|\[[^\]\n]*\]|'[^'\n]*'|\"[^\"\n]*\")+"
_BRANCH = (
    r"(?:[ \t]*" + _OPERAND + r"(?:[ \t]*(?:[=!]==?|[<>]=?)[ \t]*" + _OPERAND + r")?"
    r"[ \t]*(?:\?\??|\|\||&&)(?:[ \t]*" + _OPERAND + r"[ \t]*:)?)*"
)
# A size other than 0, which is no design value; signed and decimal numbers count.
_NONZERO = r"[-+]?(?:\.\d|(?!0(?![.\d]))\d)"

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
        # `from '...'`, a bare `import '...'`, `require('...')` and `import('...')` of any file in a `services/` folder:
        # a module's own services, the Supabase client and the API client. The error types and the generated client's
        # types (`services/api/errors`, `services/api/generated`) stay allowed.
        {
            "ts": r"(?:(?:from|import)\s+|(?:require|import)\(\s*)['\"](?:[^'\"]*/)?services/"
            r"(?!api/errors['\"/]|api/generated['\"/])[^'\"]*['\"]"
        },
        "screens and components read and write through their module's hooks, never the service or Supabase layer "
        "directly, so caching, offline behaviour and error handling live in one place",
        scope_segments=("/screens/", "/components/"),
    ),
    Rule(
        "raw-style",
        "strict",
        # A2 (D14, SRDS §43): colour literals (hex, rgb/hsl, named colours, a hex alpha appended to a token); font
        # families, weights and numeric type sizes; numeric spacing, radius, border, size, flex-basis and translate
        # values other than 0 (signed and decimal numbers count, logical properties too); numeric size-like props, as
        # numbers or strings; each of these behind a ternary or a `??`, `||` or `&&` fallback on the same line too
        # (`_BRANCH`; a ternary spread over several lines is seen only when the break falls just before the literal). flex, opacity, zIndex, aspectRatio, elevation,
        # percentages and `transparent` stay allowed: they are not part of the visual system. The rule reads literals,
        # not arithmetic on tokens (`space[1] / 2`) or constants.
        {
            "ts": "|".join(
                [
                    r"['\"`]#[0-9A-Fa-f]{3,8}['\"`]",  # a hex colour
                    r"\b(?:rgba?|hsla?)\(",
                    r"\}[0-9A-Fa-f]{2}`",  # `${colors.x}1A`: a tint belongs in the theme
                    # A named colour in a style or a prop, also as a ternary branch or a template string.
                    r"\b\w*[cC]olor\s*:" + _BRANCH + r"\s*['\"`](?!transparent['\"`])[a-z]",
                    r"\b\w*[cC]olor=\{?" + _BRANCH + r"\s*['\"`](?!transparent['\"`])[a-z]",
                    r"\b\w*[cC]olor=\{\{[^}]*:\s*['\"`](?!transparent['\"`])[a-z]",  # trackColor={{ false: 'gray' }}
                    r"\b(?:fontSize|lineHeight|letterSpacing)\s*:" + _BRANCH + r"\s*[-+]?\.?\d",
                    r"\bfontFamily\s*:" + _BRANCH + r"\s*['\"]",
                    # A weight comes from the theme's type style, which pairs it with the font file.
                    r"\bfontWeight\s*:" + _BRANCH + r"\s*(?:['\"]?\d|['\"](?:bold|normal|bolder|lighter)['\"])",
                    r"\b(?:(?:padding|margin)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End|Block|Inline)?"
                    r"(?:Start|End)?|gap|rowGap|columnGap|flexBasis|translateX|translateY|"
                    r"border(?:Top|Bottom|Start|End)?(?:Left|Right|Start|End)?Radius|"
                    r"border(?:Top|Bottom|Left|Right|Start|End|Horizontal|Vertical|Block|Inline)?Width|width|height|"
                    r"min(?:Width|Height)|max(?:Width|Height)|top|bottom|left|right|start|end|"
                    r"inset(?:Block|Inline)?(?:Start|End)?|outlineWidth|outlineOffset|shadowRadius|textShadowRadius)"
                    r"\s*:" + _BRANCH + r"\s*" + _NONZERO,
                    r"\b(?:size|strokeWidth|hitSlop|width|height|keyboardVerticalOffset|gap)=\{"
                    + _BRANCH + r"\s*['\"]?" + _NONZERO,
                    r"\b(?:size|strokeWidth|width|height)=['\"]\d",  # a size passed as a string
                    # Size-like props on our own components.
                    r"\b\w+(?:Size|Gap|Width|Height|Radius|Spacing|Offset)=\{" + _BRANCH + r"\s*" + _NONZERO,
                ]
            )
        },
        "every colour, type size, space, corner, border and size comes from frontend/theme, so the app looks one way and "
        "a design change is one edit (SRDS section 43)",
        scope=("frontend/", "App.tsx"),
        exempt=("frontend/theme/",),
    ),
    Rule(
        "header-right",
        "strict",
        # headerLeft, a component headerTitle and headerSearchBarOptions are mounted in the hidden native header too; a
        # string title is only text.
        {"ts": r"\bheader(?:Right|Left|SearchBarOptions)\b|(?<![.\w])headerTitle\s*:\s*(?![\s'\"`])"},
        "pass a screen's app-bar actions to stackOptionsWithActions (frontend/navigation/stackHeader.tsx): with the app's "
        "own header, native-stack still mounts headerRight, headerLeft, a component headerTitle and a search bar in its "
        "hidden native header, so they ran twice (A2); a title is a string",
        scope=("frontend/", "App.tsx"),
    ),
    Rule(
        "console-call",
        "strict",
        {"ts": r"\bconsole\.(?:log|info|warn|error|debug)\("},
        "use the logger in frontend/utils/logger.ts, so what reaches a log is decided in one place",
        exempt=("frontend/utils/logger.ts",),
    ),
    # Computed from resolved imports, not a text pattern: see module_boundary_hits().
    Rule(
        "module-boundary",
        "strict",
        {},
        "modules meet only at public entry points (docs/plan.md, section 1, rule 4): another frontend module only through its "
        "index.ts, another backend module only through its service.py or schemas.py; shared code uses a module only as "
        "types; a barrel re-exports only its own files; no import cycle runs through a barrel",
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
    in_scope = path.startswith("frontend/") or path in ("App.tsx", "index.js")
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
            exempted = any(path == e or (e.endswith("/") and path.startswith(e)) for e in rule.exempt)
            if not pattern or (rule.scope and not path.startswith(rule.scope)) or exempted:
                continue
            if rule.scope_segments and not any(seg in "/" + path for seg in rule.scope_segments):
                continue
            for match in re.finditer(pattern, text, flags=re.MULTILINE):
                line_no = text.count("\n", 0, match.start()) + 1
                line = text.splitlines()[line_no - 1].strip() if text else ""
                counts[rule.name][path] += 1
                where[rule.name].append((path, line_no, line[:120]))
    for path, line_no, line in module_boundary_hits(files):
        counts["module-boundary"][path] += 1
        where["module-boundary"].append((path, line_no, line))
    return counts, where


# --------------------------------------------------------------------------- module boundary (A1)
# The rule reads imports, not values: shared code that imports a module's function and hands it on in a variable still
# passes, as do `sys.modules[...]`, `getattr(service, "repo")` and a service bound to a second name on the backend. It
# catches the common ways of reaching into another module (each has a case in scripts/test_check_reality.py); review
# covers the rest.

ROLE_MODULES = ("admin", "farmer", "dealer", "buyer", "expert", "ai", "inventory")
# frontend/common/<name> folders that are shared code, not feature modules (docs/plan.md §2).
SHARED_COMMON = (
    "components", "forms", "validation", "types", "constants", "formatting", "error-handling", "loading",
    "permissions", "api",
)
RESOLVE_EXTS = (".ts", ".tsx", ".js", ".jsx", ".json", ".d.ts")
# The app's entry files sit at the repository root; like navigation, they may use a module's barrel at runtime.
ENTRY_FILES = ("App.tsx", "index.js")
# Every way one file loads another: `import … from` / `export … from`, a bare `import '…'`, and the calls `import('…')`
# and `require('…')`. A clause never runs into the next import or export line and holds quotes only as whole quoted
# names (`import { 'a' as b }`), so one match is one statement even without semicolons (a lazy match across two
# statements once hid a runtime import behind `type`). Import-shaped text inside a string literal also matches; that
# fails closed, which is the safe direction for a gate.
IMPORT_STMT = re.compile(
    r"(?:^|;|\n)[ \t]*(?P<kw>import|export)\b"
    r"(?P<clause>(?:(?!\n[ \t]*(?:import|export)\b)(?:[^;'\"`]|'[^'\n]*'|\"[^\"\n]*\"))*?)"
    r"\bfrom\s*(?P<q>['\"])(?P<spec>[^'\"\n]+)(?P=q)"
    r"|(?:^|;|\n)[ \t]*import\s*(?P<q2>['\"])(?P<bare>[^'\"\n]+)(?P=q2)"
    r"|(?<![\w$.])(?P<call>import|require)\s*\(\s*(?:(?P<q3>['\"])(?P<called>[^'\"\n]+)(?P=q3)\s*\)|(?P<computed>[^)\s]))"
)


# One name in an import or export list: `a`, or `a as b`.
NAME_PART = re.compile(r"[\w$]+(?:\s+as\s+[\w$]+)?")
# `export { a, b as c }` with no `from`: it exports names the file already has.
EXPORT_LOCAL = re.compile(r"(?:^|;|\n)[ \t]*export\s*(?:type\s*)?\{(?P<names>[^}]*)\}(?!\s*from\b)")
# What may come straight before an `import(`/`require(` call: the start of a line, an operator or bracket (including
# the `)` of `if (…)`), or a keyword that takes an expression. Words in UI copy ("we require (…)", "could not import
# (…)") do not.
CODE_BEFORE_CALL = re.compile(
    r"(?:\A|\n|[=(),:?\[{};!&|+\-*/%<>~^]|\b(?:return|await|yield|void|typeof|else|do|case|in|of|new|throw|default))"
    r"[ \t]*\Z"
)


class ImportRef(NamedTuple):
    """One import in a frontend file.

    `kind` is "from", "bare" (side effect only), "import()"/"require()", or "unreadable": a call whose argument is not
    one plain quoted string, or a specifier with an escape in it. Metro still resolves those (it evaluates the
    argument), so the gate cannot tell where they lead and refuses them.
    """

    kind: str
    keyword: str  # "import" or "export" for kind "from"
    clause: str  # what is imported, for kind "from"; "*" otherwise (every export of the target may be used)
    spec: str
    offset: int  # position of the specifier, for the line number
    target: str | None  # the resolved file, or None for a package or an unresolved path


def _imports(path: str, text: str, fileset: set[str]) -> list[ImportRef]:
    import posixpath

    refs: list[ImportRef] = []
    for m in IMPORT_STMT.finditer(text):
        if m["computed"] is not None:
            # Only a call in code position counts; "Documents we require (CNIC …)" in UI copy is not a call.
            if CODE_BEFORE_CALL.search(text, 0, m.start("call")):
                refs.append(ImportRef("unreadable", m["call"], "*", "", m.start("computed"), None))
            continue
        if m["spec"] is not None:
            kind, keyword, clause, group = "from", m["kw"], " ".join(m["clause"].split()), "spec"
        elif m["bare"] is not None:
            kind, keyword, clause, group = "bare", "import", "*", "bare"
        else:
            kind, keyword, clause, group = f"{m['call']}()", m["call"], "*", "called"
        spec = m[group]
        if "\\" in spec:
            refs.append(ImportRef("unreadable", keyword, clause, spec, m.start(group), None))
            continue
        target = _resolve(posixpath.dirname(path), spec, fileset) if spec.startswith(".") else None
        refs.append(ImportRef(kind, keyword, clause, spec, m.start(group), target))
    return refs


def frontend_module(path: str) -> str | None:
    """The feature module a frontend file belongs to ("farmer", "common/orders"), or None for shared code."""
    parts = path.split("/")
    if len(parts) < 3 or parts[0] != "frontend":
        return None
    if parts[1] in ROLE_MODULES:
        return parts[1]
    if parts[1] == "common" and len(parts) >= 4 and parts[2] not in SHARED_COMMON:
        return f"common/{parts[2]}"
    return None


# After one of these, a `/` starts a regular expression, not a division. `<` and `}` are left out: in JSX they come
# before a closing tag (`</Text>`, `} />`) or a division (`{a} / {b}`), and a regular expression after either is
# vanishingly rare.
REGEX_AFTER_CHARS = set("(,=:[!&|?{;+-*%>~^")
WORD = re.compile(r"[\w$]+")
REGEX_AFTER_WORDS = {"return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "yield", "await"}


def _mask_comments(text: str) -> str:
    r"""Blank out comments, keeping line breaks, so an import in a comment is not counted.

    Strings stay (they hold the specifiers). A regular expression literal is skipped whole, because `/*` or `//` inside
    one (`p.replace(/^\/*/, '')`) is not a comment; reading it as one once hid the rest of a file from the gate. An
    unterminated `/*` is left visible for the same reason.
    """
    out, i, n = list(text), 0, len(text)
    quote: str | None = None
    last, last_word = "", ""
    while i < n:
        c = text[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            # A '…' or "…" string cannot span lines, so a misread never outlives its line (a JSX `{'km/h'}` once
            # left the quote state inverted until a URL further down was read as a comment).
            if c == quote or (c == "\n" and quote != "`"):
                quote, last, last_word = None, c, ""
            i += 1
            continue
        if c in "'\"`":
            quote = c
        elif text.startswith("//", i) or text.startswith("/*", i):
            if text[i + 1] == "/":
                end = text.find("\n", i)
                end = n if end == -1 else end
            else:
                close = text.find("*/", i + 2)
                if close == -1:
                    i += 2
                    continue
                end = close + 2
            out[i:end] = [ch if ch == "\n" else " " for ch in text[i:end]]
            i = end
            continue
        elif c == "/" and (not last or last in REGEX_AFTER_CHARS or last_word in REGEX_AFTER_WORDS):
            j, in_class = i + 1, False
            while j < n and text[j] != "\n":
                ch = text[j]
                if ch == "\\":
                    j += 2
                    continue
                if ch == "[":
                    in_class = True
                elif ch == "]":
                    in_class = False
                elif ch == "/" and not in_class:
                    break
                j += 1
            i, last, last_word = j + 1, "/", ""
            continue
        elif c.isalnum() or c in "_$":
            m = WORD.match(text, i)
            word = m.group(0) if m else c
            i, last, last_word = i + len(word), word[-1], word
            continue
        elif not c.isspace():
            last, last_word = c, ""
        i += 1
    return "".join(out)


def _resolve(base_dir: str, spec: str, fileset: set[str]) -> str | None:
    import posixpath

    p = posixpath.normpath(posixpath.join(base_dir, spec))
    for candidate in (p, *(p + e for e in RESOLVE_EXTS), *(f"{p}/index{e}" for e in RESOLVE_EXTS)):
        if candidate in fileset:
            return candidate
    return None


def _frontend_hits(ts_files: list[str], fileset: set[str]) -> list[tuple[str, int, str]]:
    hits: list[tuple[str, int, str]] = []
    runtime: dict[str, set[str]] = {}
    barrel_sources: dict[str, dict[str, str]] = {}  # barrel -> exported name -> source file
    parsed: dict[str, list[ImportRef]] = {}
    masked: dict[str, str] = {}
    for path in ts_files:
        text = _mask_comments((ROOT / path).read_text(encoding="utf-8", errors="replace"))
        masked[path] = text
        parsed[path] = _imports(path, text, fileset)
        mod = frontend_module(path)
        if mod and path == f"frontend/{mod}/index.ts":
            names: dict[str, str] = {}
            for ref in parsed[path]:
                for part in re.findall(r"[\w$]+(?:\s+as\s+[\w$]+)?", re.sub(r"^\s*type\b", "", ref.clause)):
                    names[part.split(" as ")[-1].strip()] = ref.target or ""
            barrel_sources[path] = names

    def line_of(path: str, ref: ImportRef) -> tuple[int, str]:
        text = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        no = text.count("\n", 0, ref.offset) + 1
        return no, text.splitlines()[no - 1].strip()[:120]

    for path, refs in parsed.items():
        src_mod = frontend_module(path)
        is_barrel = path in barrel_sources
        # The entry files and navigation compose the app, so they may use a module's barrel at runtime.
        composes = path in ENTRY_FILES or path.startswith("frontend/navigation/")
        runtime.setdefault(path, set())
        for ref in refs:
            type_only = ref.kind == "from" and ref.clause.startswith("type ")
            if ref.kind == "unreadable":
                hits.append((path, *line_of(path, ref)))
                continue
            if ref.target is None:
                continue
            dst_mod = frontend_module(ref.target)
            if src_mod is None and dst_mod is not None and ref.kind == "from" and ref.keyword == "export":
                # Shared code never passes a module's exports on: re-exported through navigation, a service would
                # reach a screen that may not import it (found by the A1 verification).
                hits.append((path, *line_of(path, ref)))
                continue
            # A lazy import() does not run at start-up, so it cannot take part in a start-up cycle.
            if not type_only and ref.kind != "import()":
                runtime[path].add(ref.target)
            if is_barrel:
                own = ref.target.startswith(f"frontend/{src_mod}/")
                if ref.kind != "from" or ref.keyword != "export" or ref.clause.startswith("*") or not own:
                    hits.append((path, *line_of(path, ref)))
                continue
            if dst_mod is None:
                continue
            barrel = f"frontend/{dst_mod}/index.ts"
            if dst_mod == src_mod:
                # Inside a module, files import each other directly; going through its own barrel hides which layer is
                # used (a screen reaching its own service) and loads the whole module.
                if ref.target == barrel:
                    hits.append((path, *line_of(path, ref)))
                continue
            if path.startswith("frontend/navigation/") and "/screens/" in ref.target:
                continue  # navigation mounts a module's screens directly
            if ref.target != barrel:
                hits.append((path, *line_of(path, ref)))
            elif src_mod is None and not type_only and not composes:
                hits.append((path, *line_of(path, ref)))
            elif ("/screens/" in path or "/components/" in path) and not type_only:
                # A screen may not reach a service through another module's barrel either (layer-boundary). A
                # namespace import, a bare import or a require() may use every name the barrel exports.
                sources = barrel_sources.get(ref.target, {})
                if "*" in ref.clause:
                    used = list(sources)
                else:
                    stripped = re.sub(r"\btype\s+[\w$]+", "", ref.clause)
                    used = re.findall(r"(?<![\w$])([\w$]+)(?:\s+as\s+[\w$]+)?", stripped)
                if any("/services/" in sources.get(name, "") for name in used):
                    hits.append((path, *line_of(path, ref)))

    # Shared code may not pass a module's exports on in two steps either: `import { x } from '../farmer'`, then
    # `export { x }` (found by the A1 verification).
    for path, refs in parsed.items():
        if frontend_module(path) is not None:
            continue
        from_modules: set[str] = set()
        for ref in refs:
            if ref.kind == "from" and ref.keyword == "import" and ref.target and frontend_module(ref.target):
                from_modules |= {part.split(" as ")[-1].strip() for part in NAME_PART.findall(ref.clause)}
        for m in EXPORT_LOCAL.finditer(masked[path]):
            exported = {part.split(" as ")[0].strip() for part in NAME_PART.findall(m["names"])}
            if exported & from_modules:
                no = masked[path].count("\n", 0, m.start("names")) + 1
                line = (ROOT / path).read_text(encoding="utf-8", errors="replace").splitlines()[no - 1]
                hits.append((path, no, line.strip()[:120]))

    # A barrel loads every file it re-exports, so a runtime cycle through one can leave values undefined at start-up.
    seen: set[str] = set()
    stack: list[str] = []
    on_stack: set[str] = set()
    cycle_barrels: set[str] = set()

    def visit(node: str) -> None:
        seen.add(node)
        stack.append(node)
        on_stack.add(node)
        for nxt in sorted(runtime.get(node, ())):
            if nxt in on_stack:
                cycle = stack[stack.index(nxt):]
                cycle_barrels.update(n for n in cycle if n in barrel_sources)
            elif nxt not in seen:
                visit(nxt)
        stack.pop()
        on_stack.discard(node)

    sys.setrecursionlimit(max(sys.getrecursionlimit(), 10000))
    for node in sorted(runtime):
        if node not in seen:
            visit(node)
    hits.extend((b, 1, "runtime import cycle through this barrel") for b in sorted(cycle_barrels))
    return hits


def backend_package(dotted: str) -> tuple[str, str | None]:
    """('module', name) for a feature module, ('infra', None) for shared infrastructure, ('entry', None) otherwise."""
    parts = dotted.split(".")
    if len(parts) < 2 or parts[0] != "app":
        return "other", None
    if parts[1] in ROLE_MODULES:
        return "module", parts[1]
    if parts[1] == "common" and len(parts) >= 3 and (ROOT / "backend" / "app" / "common" / parts[2]).is_dir():
        return "module", f"common/{parts[2]}"
    if parts[1] in ("main", "api_router"):
        return "entry", None
    return "infra", None


def _backend_file(dotted: str) -> Path:
    return ROOT / "backend" / (dotted.replace(".", "/") + ".py")


@functools.cache
def _bound_by_import(dotted: str) -> frozenset[str]:
    """Names a backend module binds by importing, such as a service's `repo`. They are attributes of that module too,
    so reaching one through it (`from app.farmer.service import repo`) is reaching past it."""
    import ast

    path = _backend_file(dotted)
    if not path.is_file():
        return frozenset()
    names: set[str] = set()
    for node in ast.parse(path.read_text(encoding="utf-8", errors="replace")).body:
        if isinstance(node, ast.Import):
            names |= {a.asname or a.name.split(".")[0] for a in node.names}
        elif isinstance(node, ast.ImportFrom) and not (node.module or "").endswith("schemas"):
            # Models a service imports from a schemas module are public types anyway, so they stay reachable.
            names |= {a.asname or a.name for a in node.names}
    return frozenset(names)


def _foreign(target: str, src_mod: str | None) -> bool:
    """True when a dotted app path belongs to a feature module other than the importing file's own."""
    kind, mod = backend_package(target)
    return kind == "module" and mod != src_mod


def _line_hit(path: str, lines: list[str], node: object) -> tuple[str, int, str]:
    lineno = getattr(node, "lineno", 1)
    return path, lineno, lines[lineno - 1].strip()[:120]


def _dotted_name(expr: object, aliases: dict[str, str]) -> str | None:
    """The dotted app path an expression names (`farmer_service.repo` -> `app.farmer.service.repo`), if any."""
    import ast

    if isinstance(expr, ast.Name):
        return aliases.get(expr.id)
    if isinstance(expr, ast.Attribute):
        base = _dotted_name(expr.value, aliases)
        return f"{base}.{expr.attr}" if base else None
    return None


def _backend_hits(py_files: list[str]) -> list[tuple[str, int, str]]:
    import ast

    hits: list[tuple[str, int, str]] = []
    for path in py_files:
        dotted = path[len("backend/") : -3].replace("/", ".")
        src_kind, src_mod = backend_package(dotted)
        if src_kind == "entry":
            continue
        text = (ROOT / path).read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        tree = ast.parse(text)
        package = dotted.split(".")[:-1]  # the package this file sits in (for __init__.py, the package itself)

        aliases: dict[str, str] = {}  # local name -> the app module it is bound to
        for node in ast.walk(tree):
            # (imported name, the module that name lives in, the bare name) for `import app.x.y`, `from app.x import
            # y`, `from app import x` and relative imports (`from ..x import y`, resolved against this file's package).
            triples: list[tuple[str, str, str]] = []
            if isinstance(node, ast.Import):
                triples = [(a.name, a.name, a.name) for a in node.names]
                for a in node.names:
                    aliases[a.asname or a.name.split(".")[0]] = a.name if a.asname else a.name.split(".")[0]
            elif isinstance(node, ast.ImportFrom):
                base_parts = package[: len(package) - node.level + 1] if node.level else []
                base = ".".join(base_parts + ([node.module] if node.module else []))
                triples = [(f"{base}.{a.name}", base, a.name) for a in node.names]
                for a in node.names:
                    if _backend_file(f"{base}.{a.name}").is_file():
                        aliases[a.asname or a.name] = f"{base}.{a.name}"
            elif (isinstance(node, ast.Name) and node.id == "__import__") or (
                isinstance(node, ast.Attribute) and node.attr == "__import__"
            ):
                # A dynamic import hides where it leads (`__import__`, `builtins.__import__`); the app needs none.
                hits.append(_line_hit(path, lines, node))
            for target, parent, name in triples:
                if target.split(".")[0] == "importlib":
                    hits.append(_line_hit(path, lines, node))
                    continue
                if target.split(".")[0] != "app" or not _foreign(target, src_mod):
                    continue
                # The module file the import loads: the target itself when it is a module, else its parent.
                is_file = _backend_file(target).is_file()
                module_path = target if is_file or isinstance(node, ast.Import) else parent
                allowed = module_path.endswith((".service", ".schemas"))
                if src_kind == "infra" or not allowed:
                    hits.append(_line_hit(path, lines, node))
                elif not is_file and name in _bound_by_import(parent):
                    # `from app.farmer.service import repo`: the repository, reached through the service.
                    hits.append(_line_hit(path, lines, node))

        for node in ast.walk(tree):
            if not isinstance(node, ast.Attribute):
                continue
            owner = _dotted_name(node.value, aliases)
            if not owner or not _foreign(f"{owner}.{node.attr}", src_mod):
                continue
            full = f"{owner}.{node.attr}"
            if _backend_file(full).is_file() and not full.endswith((".service", ".schemas")):
                # `app.farmer.repository` reached as an attribute.
                hits.append(_line_hit(path, lines, node))
            elif _backend_file(owner).is_file() and node.attr in _bound_by_import(owner):
                # `farmer_service.repo.fetch_farms`: the repository, reached through the service.
                hits.append(_line_hit(path, lines, node))
    return hits


def module_boundary_hits(files: list[tuple[str, str]]) -> list[tuple[str, int, str]]:
    all_files = {
        p
        for p in subprocess.run(
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=True,
            encoding="utf-8",
        ).stdout.splitlines()
        if (ROOT / p).is_file()
    }
    ts = [p for p, lang in files if lang == "ts" and (p.startswith("frontend/") or p in ENTRY_FILES)]
    py = [p for p, lang in files if lang == "py"]
    return _frontend_hits(ts, all_files) + _backend_hits(py)


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
    # LF on every OS, as .gitattributes asks: Windows text mode would otherwise write CRLF.
    BASELINE_PATH.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


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

    if not partial:
        # A gate that scans nothing passes everything: after A1 moved src/ to frontend/, a stale path would have
        # turned every frontend rule off silently. Refuse that, and refuse baseline entries for files that no longer
        # exist (a moved file would otherwise start again at zero under its new name).
        langs = {lang for _, lang in files}
        # The entry files alone do not count: with frontend/ gone they would keep the gate "scanning" nothing real.
        if (ROOT / "package.json").exists() and not any(p.startswith("frontend/") for p, lang in files if lang == "ts"):
            report.failures.append("[scan] the frontend has source files but the gate scanned none: check classify()")
        if (ROOT / "backend" / "pyproject.toml").exists() and "py" not in langs:
            report.failures.append("[scan] the backend has source files but the gate scanned none: check classify()")
        for rule_name, per_file in baseline["rules"].items():
            for path in per_file:
                if not (ROOT / path).is_file():
                    report.failures.append(f"[baseline] {rule_name}: {path} no longer exists; re-key or remove it")
        for tool, per_key in baseline["tools"].items():
            base = BACKEND if tool in ("ruff", "ruff-format", "mypy") else ROOT
            for key in per_key:
                path = key.split(":", 1)[1] if ":" in key else key
                if not (base / path).is_file():
                    report.failures.append(f"[baseline] {tool}: {path} no longer exists; re-key or remove it")

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
