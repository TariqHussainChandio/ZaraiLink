"""A1 — move the repository into the SRDS module layout and rewrite every import (docs/plan-ecommerce.md, A1).

One scripted pass instead of hand edits, so the change is reviewable as data (scripts/a1/module-map.json) and repeatable.
Subcommands, run from the repository root:

    python scripts/a1/restructure.py plan      # expand the map into scripts/a1/moves.json, refuse gaps, report the
                                               # post-move import graph (cross-module edges, barrels, violations)
    python scripts/a1/restructure.py move      # clean tree only; plain file moves (no git mv, no content change)
    python scripts/a1/restructure.py rewrite   # rewrite TS/JS specifiers and Python imports for the new paths
    python scripts/a1/restructure.py verify    # every specifier resolves; nothing left in the old folders

The move and the rewrite are separate commits (the maintainer commits), so git records pure renames first.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import posixpath
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MAP_FILE = ROOT / "scripts" / "a1" / "module-map.json"
MOVES_FILE = ROOT / "scripts" / "a1" / "moves.json"

TS_EXTS = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
RESOLVE_EXTS = (".ts", ".tsx", ".js", ".jsx", ".json", ".d.ts")
ROLE_MODULES = {"admin", "farmer", "dealer", "buyer", "expert", "ai", "inventory"}
# Shared, not feature modules: docs/plan.md §2 (frontend/common/<shared>).
SHARED_COMMON = {
    "components", "forms", "validation", "types", "constants", "formatting", "error-handling", "loading",
    "permissions", "api",
}
SKIP_DIRS = ("node_modules/", "android/", "ios/", ".expo/", "dist/", "web-build/", "coverage/")

# Specifier sites: static import/export ... from, side-effect import, dynamic import(), require(), and Jest's
# module-registry calls, which must follow the move or a mock silently stops intercepting.
SPEC_RE = re.compile(
    r"""(?P<head>\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|"""
    r"""\bjest\.(?:mock|doMock|unmock|dontMock|requireActual|requireMock|setMock|createMockFromModule)\s*\(\s*)"""
    r"""(?P<q>['"])(?P<spec>\.{1,2}/[^'"\n]*|\.{1,2})(?P=q)"""
)
# A whole static statement ending in a relative specifier: import/export <clause> from '<spec>'. [^;] keeps the
# match inside one statement (the codebase is formatted with semicolons).
STMT_RE = re.compile(
    r"""(?P<lead>^|;|\n)(?P<indent>[ \t]*)(?P<kw>import|export)\b(?P<clause>[^;]*?)\bfrom\s*"""
    r"""(?P<q>['"])(?P<spec>\.{1,2}/[^'"\n]*|\.{1,2})(?P=q)""",
    re.M,
)


def run(cmd: list[str], cwd: Path = ROOT) -> str:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=True).stdout


def repo_files(include_ignored_in: tuple[str, ...] = ()) -> list[str]:
    # -c lists the index, which still names files that were moved but not yet committed; keep only what exists.
    files = run(["git", "ls-files", "-co", "--exclude-standard"]).split("\n")
    out = [f for f in files if f and not f.startswith(SKIP_DIRS) and (ROOT / f).is_file()]
    for folder in include_ignored_in:
        ignored = run(["git", "ls-files", "-oi", "--exclude-standard", "--", folder]).split("\n")
        out += [f for f in ignored if f and "__pycache__" not in f]
    return sorted(set(out))


def is_test(path: str) -> bool:
    name = posixpath.basename(path)
    return ".test." in name or "/testUtils/" in path or path.startswith(("__tests__/", "__mocks__/")) or (
        "/__mocks__/" in path
    )


def module_of(path: str) -> str | None:
    parts = path.split("/")
    if len(parts) < 3 or parts[0] != "frontend":
        return None
    if parts[1] in ROLE_MODULES:
        return parts[1]
    if parts[1] == "common" and len(parts) >= 4 and parts[2] not in SHARED_COMMON:
        return f"common/{parts[2]}"
    return None


# --------------------------------------------------------------------------------------------------------- plan


def expand_map() -> tuple[list[tuple[str, str]], list[str]]:
    spec = json.loads(MAP_FILE.read_text(encoding="utf-8"))
    rules: list[tuple[str, str]] = [tuple(r) for r in spec["rules"]]
    drops = set(spec["drop"])
    scope = tuple(spec["in_scope"])
    files = [f for f in repo_files(include_ignored_in=("backend/app/ml",)) if f.startswith(scope)]

    moves: dict[str, str] = {}
    unmapped, dropped = [], []
    for f in files:
        if f in drops:
            dropped.append(f)
            continue
        target = next((to + f[len(src):] for src, to in rules if f.startswith(src)), None)
        if target is None:
            unmapped.append(f)
        elif target != f:
            moves[f] = target
    if unmapped:
        sys.exit("unmapped files (add a rule):\n  " + "\n  ".join(unmapped))

    # A .gitkeep only marks an otherwise-empty folder: drop it when its target folder receives other files, and keep
    # one when several empty folders merge.
    real_dirs = {posixpath.dirname(t) for f, t in moves.items() if not f.endswith(".gitkeep")}
    seen: set[str] = set()
    for f in [f for f in moves if f.endswith(".gitkeep")]:
        target = moves[f]
        if posixpath.dirname(target) in real_dirs or target in seen:
            del moves[f]
            dropped.append(f)
        else:
            seen.add(target)

    targets: dict[str, str] = {}
    for f, t in moves.items():
        if t in targets:
            sys.exit(f"two files move to {t}: {targets[t]} and {f}")
        targets[t] = f
    existing = [t for t in targets if (ROOT / t).exists() and t not in moves]
    if existing:
        sys.exit("targets already exist:\n  " + "\n  ".join(existing))

    after = [moves.get(f, f) for f in repo_files() if f not in dropped]
    test_names = defaultdict(list)
    for f in after:
        if f.startswith("backend/tests/") and posixpath.basename(f).startswith("test_") and f.endswith(".py"):
            test_names[posixpath.basename(f)].append(f)
    clashes = {k: v for k, v in test_names.items() if len(v) > 1}
    if clashes:
        sys.exit(f"backend test names must stay unique (no __init__.py): {clashes}")
    return sorted(moves.items()), sorted(dropped)


def load_moves() -> tuple[dict[str, str], list[str]]:
    data = json.loads(MOVES_FILE.read_text(encoding="utf-8"))
    return dict(data["moves"]), data["dropped"]


def resolve(base_dir: str, spec: str, fileset: set[str]) -> tuple[str | None, str | None]:
    p = posixpath.normpath(posixpath.join(base_dir, spec))
    if p in fileset:
        return p, "exact"
    for ext in RESOLVE_EXTS:
        if p + ext in fileset:
            return p + ext, "ext"
    for ext in RESOLVE_EXTS:
        if f"{p}/index{ext}" in fileset:
            return f"{p}/index{ext}", "index"
    return None, None


def ts_sources(files: list[str]) -> list[str]:
    return [f for f in files if f.endswith(TS_EXTS) and not f.startswith(("backend/", "supabase/"))]


def import_edges(moves: dict[str, str], dropped: list[str]):
    """The post-move import graph, computed from the pre-move files: (importer_new, target_new, statement, is_test)."""
    old_files = set(repo_files()) - set(dropped)
    edges = []
    for old in ts_sources(sorted(old_files)):
        text = (ROOT / old).read_text(encoding="utf-8")
        new = moves.get(old, old)
        for m in STMT_RE.finditer(text):
            target_old, _ = resolve(posixpath.dirname(old), m["spec"], old_files)
            if target_old:
                edges.append((new, moves.get(target_old, target_old), m, is_test(new)))
    return edges


def cmd_plan(_args) -> None:
    moves, dropped = expand_map()
    MOVES_FILE.write_text(
        json.dumps({"moves": moves, "dropped": dropped}, indent=1) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"{len(moves)} moves, {len(dropped)} dropped -> {MOVES_FILE.relative_to(ROOT)}")
    report_graph(dict(moves), dropped)


def report_graph(moves: dict[str, str], dropped: list[str]) -> None:
    edges = import_edges(moves, dropped)
    barrels: dict[str, set[str]] = defaultdict(set)
    notes: list[str] = []
    for importer, target, m, test in edges:
        src_mod, dst_mod = module_of(importer), module_of(target)
        if test or dst_mod is None or src_mod == dst_mod:
            continue
        if importer.startswith("frontend/navigation/") and "/screens/" in target:
            continue
        clause = " ".join(m["clause"].split())
        # Shared layers see a module only as types; navigation (where the shell mounts modules) may also use a
        # module's runtime exports, through its index.ts (plan R2).
        if src_mod is None and not clause.startswith("type ") and not importer.startswith("frontend/navigation/"):
            notes.append(f"shared -> module at runtime: {importer} -> {target}  [{clause}]")
        if re.search(r"\*\s+as\s+\w+", clause):
            notes.append(f"namespace import across modules: {importer} -> {target}")
        barrels[dst_mod].add(target)
    print()
    print("barrels (module: files re-exported):")
    for mod in sorted(barrels):
        print(f"  {mod}: {', '.join(sorted(posixpath.relpath(t, 'frontend/' + mod) for t in barrels[mod]))}")

    # File-level runtime graph after barrels: loading a module's index.ts loads every file it re-exports.
    graph: dict[str, set[str]] = defaultdict(set)
    for mod, files in barrels.items():
        graph[f"frontend/{mod}/index.ts"] |= files
    for importer, target, m, test in edges:
        if test or " ".join(m["clause"].split()).startswith("type "):
            continue
        src_mod, dst_mod = module_of(importer), module_of(target)
        crosses = dst_mod is not None and src_mod != dst_mod and not (
            importer.startswith("frontend/navigation/") and "/screens/" in target
        )
        graph[importer].add(f"frontend/{dst_mod}/index.ts" if crosses else target)
    cycles = [c for c in find_cycles(graph) if any(n.endswith("/index.ts") for n in c)]
    print()
    print(f"runtime file cycles through a barrel ({len(cycles)}):")
    for c in cycles:
        print("  " + " -> ".join(c))
    print()
    print(f"violations to fix in the map or the code ({len(set(notes))}):")
    for n in sorted(set(notes)):
        print("  " + n)


def find_cycles(graph: dict[str, set[str]]) -> list[list[str]]:
    cycles, stack, on_stack, seen = [], [], set(), set()

    def visit(node: str) -> None:
        seen.add(node)
        stack.append(node)
        on_stack.add(node)
        for nxt in sorted(graph.get(node, ())):
            if nxt in on_stack:
                cycles.append(stack[stack.index(nxt):] + [nxt])
            elif nxt not in seen:
                visit(nxt)
        stack.pop()
        on_stack.discard(node)

    for n in sorted(graph):
        if n not in seen:
            visit(n)
    return cycles


# --------------------------------------------------------------------------------------------------------- move


def cmd_move(_args) -> None:
    dirty = run(["git", "status", "--porcelain"]).strip()
    if dirty:
        sys.exit("the tree must be clean before the move (commit the A1.0 changes first):\n" + dirty)
    moves, dropped = load_moves()
    for old, new in moves.items():
        dst = ROOT / new
        dst.parent.mkdir(parents=True, exist_ok=True)
        os.replace(ROOT / old, dst)
    for old in dropped:
        (ROOT / old).unlink()
    for base in ("src", "backend/app", "backend/tests/unit"):
        for dirpath, dirnames, _ in sorted(os.walk(ROOT / base, topdown=False)):
            d = Path(dirpath)
            if d.name == "__pycache__":
                for f in d.iterdir():
                    f.unlink()
                d.rmdir()
            elif d.exists() and not any(d.iterdir()):
                d.rmdir()
    print(f"moved {len(moves)} files, dropped {len(dropped)}")


# ------------------------------------------------------------------------------------------------------ rewrite


def new_spec(importer_dir: str, target: str, kind: str) -> str:
    if kind == "ext":
        target = re.sub(r"(\.d\.ts|\.tsx?|\.jsx?|\.json)$", "", target)
    elif kind == "index":
        target = posixpath.dirname(target)
    rel = posixpath.relpath(target, importer_dir)
    return rel if rel.startswith(".") else "./" + rel


EXPORT_DECL_RE = re.compile(
    r"^export\s+(?:declare\s+)?(?P<kind>interface|type|enum|const enum|const|let|var|function|async function|class|"
    r"abstract class)\s+(?P<name>\w+)",
    re.M,
)


def exported_kinds(path: Path) -> dict[str, str]:
    """name -> 'type' | 'value' for a file's own exports (what a generated barrel must re-export, and how)."""
    text = path.read_text(encoding="utf-8")
    kinds = {}
    for m in EXPORT_DECL_RE.finditer(text):
        kinds[m["name"]] = "type" if m["kind"] in ("interface", "type") else "value"
    for m in re.finditer(r"^export\s+(type\s+)?\{([^}]*)\}", text, re.M):
        for part in m.group(2).split(","):
            part = part.strip()
            if not part:
                continue
            is_type = bool(m.group(1)) or part.startswith("type ")
            name = part.split(" as ")[-1].replace("type ", "").strip()
            kinds[name] = "type" if is_type else "value"
    return kinds


def parse_names(clause: str) -> tuple[bool, str | None, list[tuple[str, str, bool]], bool]:
    """(statement is type-only, default local name, [(imported, local, is_type)], namespace)"""
    c = " ".join(clause.split())
    type_only = c.startswith("type ")
    if type_only:
        c = c[5:]
    if re.match(r"^\*", c):
        return type_only, None, [], True
    default = None
    named: list[tuple[str, str, bool]] = []
    brace = re.search(r"\{(.*)\}", c)
    head = c[: brace.start()] if brace else c
    head = head.strip().rstrip(",").strip()
    if head:
        default = head
    if brace:
        for part in brace.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            is_type = type_only or part.startswith("type ")
            part = part[5:] if part.startswith("type ") else part
            imported, _, local = part.partition(" as ")
            named.append((imported.strip(), (local or imported).strip(), is_type))
    return type_only, default, named, False


def format_import(indent: str, head: str, names: list[str], q: str, spec: str) -> str:
    """One import statement in the codebase's (Prettier) shape: one line when it fits, else one name per line."""
    one = f"{indent}{head}{{ {', '.join(names)} }} from {q}{spec}{q}"
    if len(one) + 1 <= 100:
        return one
    body = "".join(f"{indent}  {n},\n" for n in names)
    return f"{indent}{head}{{\n{body}{indent}}} from {q}{spec}{q}"


def merge_duplicate_imports(text: str) -> str:
    """Barrel routing can leave two imports of the same module in one file; merge named imports of the same specifier
    into one statement (types marked inline), as import/no-duplicates expects."""
    groups: dict[str, list[re.Match]] = defaultdict(list)
    for m in STMT_RE.finditer(text):
        if m["kw"] == "import":
            groups[m["spec"]].append(m)
    edits: list[tuple[int, int, str]] = []
    for spec, ms in groups.items():
        if len(ms) < 2:
            continue
        parsed = [parse_names(m["clause"]) for m in ms]
        if any(default or namespace for _, default, _, namespace in parsed):
            continue
        all_types = all(type_only for type_only, *_ in parsed)
        names: list[str] = []
        for type_only, _, named, _ in parsed:
            for imported, local, is_type in named:
                entry = ("" if all_types or not (type_only or is_type) else "type ") + imported + (
                    f" as {local}" if local != imported else ""
                )
                if entry not in names:
                    names.append(entry)
        first = ms[0]
        head = "import type " if all_types else "import "
        edits.append((first.start("indent"), first.end(), format_import(first["indent"], head, names, first["q"], spec)))
        for m in ms[1:]:
            end = m.end()
            end += 1 if text[end : end + 1] == ";" else 0
            end += 1 if text[end : end + 1] == "\n" else 0
            edits.append((m.start("indent"), end, ""))
    for start, end, replacement in sorted(edits, reverse=True):
        text = text[:start] + replacement + text[end:]
    return text


def cmd_tidy(_args) -> None:
    changed = 0
    for f in ts_sources(repo_files()):
        if not f.startswith("frontend/") or "/generated/" in f:
            continue
        path = ROOT / f
        text = path.read_text(encoding="utf-8")
        tidy = merge_duplicate_imports(text)
        if tidy != text:
            path.write_text(tidy, encoding="utf-8", newline="\n")
            changed += 1
    print(f"tidy: merged duplicate imports in {changed} files")


def cmd_rewrite(_args) -> None:
    moves, dropped = load_moves()
    reverse = {new: old for old, new in moves.items()}
    current = set(repo_files())
    old_files = {reverse.get(f, f) for f in current}
    barrels: dict[str, dict[str, dict[str, tuple[str, str]]]] = defaultdict(lambda: defaultdict(dict))
    problems: list[str] = []
    changed = 0

    for new in ts_sources(sorted(current)):
        old = reverse.get(new, new)
        path = ROOT / new
        text = path.read_text(encoding="utf-8")
        new_dir, old_dir = posixpath.dirname(new), posixpath.dirname(old)
        test = is_test(new)
        src_mod = module_of(new)

        def route(target_new: str) -> str | None:
            """The barrel a production import of target_new must go through, if any."""
            dst_mod = module_of(target_new)
            if test or dst_mod is None or dst_mod == src_mod:
                return None
            if new.startswith("frontend/navigation/") and "/screens/" in target_new:
                return None
            if posixpath.basename(target_new).startswith("index."):
                return None
            return dst_mod

        def fix_stmt(m: re.Match) -> str:
            target_old, kind = resolve(old_dir, m["spec"], old_files)
            if target_old is None:
                return m.group(0)
            target_new = moves.get(target_old, target_old)
            dst_mod = route(target_new)
            if dst_mod is None:
                return m.group(0).replace(m["q"] + m["spec"] + m["q"], m["q"] + new_spec(new_dir, target_new, kind) + m["q"])
            type_only, default, named, namespace = parse_names(m["clause"])
            if namespace:
                problems.append(f"namespace import across modules kept deep: {new} -> {target_new}")
                return m.group(0).replace(m["q"] + m["spec"] + m["q"], m["q"] + new_spec(new_dir, target_new, kind) + m["q"])
            kinds = exported_kinds(ROOT / target_new)
            source = re.sub(r"(\.d\.ts|\.tsx?|\.jsx?)$", "", posixpath.relpath(target_new, f"frontend/{dst_mod}"))
            parts = []
            if default:
                barrels[dst_mod][source][default] = ("default", "value")
                parts.append(default)
            for imported, local, is_type in named:
                kind_of = "type" if is_type or kinds.get(imported) == "type" else "value"
                barrels[dst_mod][source][imported] = (imported, kind_of)
                prefix = "type " if is_type and not type_only else ""
                parts.append(f"{prefix}{imported}" + (f" as {local}" if local != imported else ""))
            barrel_spec = new_spec(new_dir, f"frontend/{dst_mod}/index.ts", "index")
            head = f"{m['kw']} " + ("type " if type_only else "")
            return m["lead"] + format_import(m["indent"], head, parts, m["q"], barrel_spec)

        rewritten = STMT_RE.sub(fix_stmt, text)

        def fix_other(m: re.Match) -> str:
            # Anything STMT_RE did not handle: side-effect imports, import(), require(), jest.* calls. Statements it
            # already rewrote resolve against the NEW tree, so try the old tree first and fall back.
            target_old, kind = resolve(old_dir, m["spec"], old_files)
            if target_old is None:
                return m.group(0)
            if resolve(new_dir, m["spec"], current)[0] is not None and moves.get(target_old, target_old) == resolve(
                new_dir, m["spec"], current
            )[0]:
                return m.group(0)
            target_new = moves.get(target_old, target_old)
            return f"{m['head']}{m['q']}{new_spec(new_dir, target_new, kind)}{m['q']}"

        rewritten = SPEC_RE.sub(fix_other, rewritten)
        if new.startswith("frontend/") and "/generated/" not in new:  # generated code is the generator's alone
            rewritten = merge_duplicate_imports(rewritten)
        if rewritten != text:
            path.write_text(rewritten, encoding="utf-8", newline="\n")
            changed += 1

    for mod, sources in barrels.items():
        lines = [
            f"// Public entry point of frontend/{mod} (A1, docs/plan.md §1 rule 4): other modules import only what is",
            "// listed here. Generated by scripts/a1/restructure.py from the imports that cross into this module.",
        ]
        for source in sorted(sources):
            names = sources[source]
            values = sorted(
                (f"default as {local}" if imported == "default" else imported)
                for local, (imported, kind) in names.items() if kind == "value"
            )
            types = sorted(n for n, (_, kind) in names.items() if kind == "type")
            if values:
                lines.append(f"export {{ {', '.join(values)} }} from './{source}';")
            if types:
                lines.append(f"export type {{ {', '.join(types)} }} from './{source}';")
        (ROOT / f"frontend/{mod}/index.ts").write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    py_changed = rewrite_python(moves)
    # Absolute imports sort differently; ruff owns the order and the formatting.
    for args in (["check", "--select", "I", "--fix", "--quiet", "app", "tests"], ["format", "--quiet", "app", "tests"]):
        subprocess.run(["uv", "run", "ruff", *args], cwd=ROOT / "backend", check=True, capture_output=True)
    rekey_baseline(moves)
    print(f"rewrote {changed} TS/JS files, {py_changed} Python files, generated {len(barrels)} barrels")
    for p in problems:
        print("  " + p)


def rekey_baseline(moves: dict[str, str]) -> None:
    """Carry scripts/reality-baseline.json over to the moved paths. Every count stays exactly as recorded: a moved
    file keeps its debt under its new name, and the totals per rule and per tool are asserted unchanged."""
    path = ROOT / "scripts" / "reality-baseline.json"
    data = json.loads(path.read_text(encoding="utf-8"))

    def move(p: str, prefix: str = "") -> str:
        return moves.get(prefix + p, prefix + p)[len(prefix):]

    before = {k: sum(v.values()) for k, v in {**data["rules"], **data["tools"]}.items()}
    data["rules"] = {rule: {move(p): n for p, n in files.items()} for rule, files in data["rules"].items()}
    tools = {}
    for tool, keys in data["tools"].items():
        prefix = "backend/" if tool in ("ruff", "ruff-format", "mypy") else ""
        moved: dict[str, int] = defaultdict(int)
        for key, n in keys.items():
            code, _, p = key.partition(":")
            moved[f"{code}:{move(p, prefix)}"] += n
        tools[tool] = dict(sorted(moved.items()))
    data["tools"] = tools
    after = {k: sum(v.values()) for k, v in {**data["rules"], **data["tools"]}.items()}
    assert before == after, (before, after)
    path.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


# ---------------------------------------------------------------------------------------------- Python rewrite


def module_name(path: str) -> str | None:
    if not path.startswith("backend/app/") or not path.endswith(".py"):
        return None
    return path[len("backend/") : -3].replace("/", ".")


def rewrite_python(moves: dict[str, str]) -> int:
    old_to_new = {}
    for old, new in moves.items():
        a, b = module_name(old), module_name(new)
        if a and b:
            old_to_new[a] = b
    old_modules = set(old_to_new) | {"app.main"}

    def map_module(dotted: str) -> str:
        if dotted in old_to_new:
            return old_to_new[dotted]
        return dotted

    changed = 0
    backend_files = [f for f in repo_files() if f.startswith("backend/") and f.endswith(".py")]
    reverse = {new: old for old, new in moves.items()}
    for new in backend_files:
        old = reverse.get(new, new)
        path = ROOT / new
        text = path.read_text(encoding="utf-8")
        tree = ast.parse(text)
        own_old = module_name(old)
        lines = text.split("\n")
        edits: list[tuple[int, int, str]] = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.ImportFrom):
                continue
            if node.level:
                base = own_old.split(".")[:-1]
                base = base[: len(base) - (node.level - 1)]
                absmod = base + (node.module.split(".") if node.module else [])
            elif node.module and (node.module == "app" or node.module.startswith("app.")):
                absmod = node.module.split(".")
            else:
                continue
            statements: list[str] = []
            attrs: list[str] = []
            for alias in node.names:
                candidate = ".".join(absmod + [alias.name])
                bound = alias.asname or alias.name
                if candidate in old_modules:
                    target = map_module(candidate)
                    pkg, _, leaf = target.rpartition(".")
                    statements.append(f"from {pkg} import {leaf}" + ("" if bound == leaf else f" as {bound}"))
                else:
                    attrs.append(alias.name + (f" as {alias.asname}" if alias.asname else ""))
            if attrs:
                statements.insert(0, f"from {map_module('.'.join(absmod))} import {', '.join(attrs)}")
            indent = re.match(r"[ \t]*", lines[node.lineno - 1]).group(0)
            edits.append((node.lineno - 1, node.end_lineno - 1, "\n".join(indent + s for s in statements)))
        for start, end, replacement in sorted(edits, reverse=True):
            lines[start : end + 1] = [replacement]
        out = "\n".join(lines)
        # Dotted module paths in strings (mock.patch targets): longest old module prefix wins.
        for old_mod in sorted(old_to_new, key=len, reverse=True):
            out = re.sub(
                rf"(['\"]){re.escape(old_mod)}(?=[.'\"])",
                lambda m, n=old_to_new[old_mod]: m.group(1) + n,
                out,
            )
        if out != text:
            path.write_text(out, encoding="utf-8", newline="\n")
            changed += 1
    return changed


# ------------------------------------------------------------------------------------------------------- verify


def mask_comments(text: str) -> str:
    """The text with // and /* */ comments blanked (strings and template literals respected), so an example import
    in a doc comment is not mistaken for a real one."""
    out, i, n, quote = list(text), 0, len(text), None
    while i < n:
        c = text[i]
        if quote:
            if c == "\\":
                i += 2
                continue
            if c == quote:
                quote = None
        elif c in "'\"`":
            quote = c
        elif text.startswith("//", i):
            end = text.find("\n", i)
            end = n if end == -1 else end
            out[i:end] = " " * (end - i)
            i = end
            continue
        elif text.startswith("/*", i):
            end = text.find("*/", i + 2)
            end = n if end == -1 else end + 2
            out[i:end] = [ch if ch == "\n" else " " for ch in text[i:end]]
            i = end
            continue
        i += 1
    return "".join(out)


def cmd_verify(_args) -> None:
    current = set(repo_files())
    bad = []
    for f in ts_sources(sorted(current)):
        text = mask_comments((ROOT / f).read_text(encoding="utf-8"))
        for m in SPEC_RE.finditer(text):
            if resolve(posixpath.dirname(f), m["spec"], current)[0] is None:
                bad.append(f"{f}: {m['spec']}")
    leftovers = [f for f in current if f.startswith(("src/", "backend/app/core/", "backend/app/services/",
                                                     "backend/app/repositories/", "backend/app/schemas/",
                                                     "backend/app/api/", "backend/tests/unit/"))]
    for b in bad:
        print("unresolved:", b)
    for f in leftovers:
        print("left behind:", f)
    if bad or leftovers:
        sys.exit(1)
    print(f"verify: {len(ts_sources(sorted(current)))} TS/JS files resolve; no files left in the old folders")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    for name, fn in (
        ("plan", cmd_plan),
        ("move", cmd_move),
        ("rewrite", cmd_rewrite),
        ("tidy", cmd_tidy),
        ("verify", cmd_verify),
    ):
        sub.add_parser(name).set_defaults(fn=fn)
    args = parser.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
