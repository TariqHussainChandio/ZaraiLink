"""Tests for scripts/check_reality.py: proof that the gate fails when it should.

Each test builds a throwaway git repository holding only a copy of the script, plants a violation,
and runs the real gate against it. The project tree is never touched, so these run anywhere.

    python -m pytest scripts/test_check_reality.py
"""

import json
import shutil
import subprocess
import sys
import textwrap
from pathlib import Path

import pytest

SCRIPT = Path(__file__).with_name("check_reality.py")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    (tmp_path / "scripts").mkdir()
    shutil.copy(SCRIPT, tmp_path / "scripts" / "check_reality.py")
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    return tmp_path


def write(repo: Path, rel: str, text: str) -> None:
    path = repo / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(textwrap.dedent(text), encoding="utf-8")


def gate(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "scripts/check_reality.py", *args], cwd=repo, capture_output=True, text=True, encoding="utf-8"
    )


def baseline(repo: Path) -> dict:
    return json.loads((repo / "scripts" / "reality-baseline.json").read_text(encoding="utf-8"))


# ------------------------------------------------------------------ strict rules


STRICT_CASES = [
    ("stub-marker", "src/a.ts", "export const f = () => { throw new Error('Not implemented'); };\n"),
    ("stub-marker", "src/a.tsx", "export const Label = () => 'Coming soon';\n"),
    ("stub-marker", "backend/app/a.py", "def f():\n    raise NotImplementedError\n"),
    ("todo-without-issue", "src/a.ts", "// TODO: fix this later\nexport const x = 1;\n"),
    ("todo-without-issue", "backend/app/a.py", "# FIXME make this real\nx = 1\n"),
    ("empty-catch", "src/a.ts", "export const f = () => { try { g(); } catch (e) {} };\n"),
    ("empty-catch", "backend/app/a.py", "try:\n    f()\nexcept ValueError:\n    pass\n"),
    ("ts-suppression", "src/a.ts", "// @ts-ignore\nexport const x: number = 'a';\n"),
    ("test-double-in-prod", "src/a.ts", "export const send = jest.fn();\n"),
    ("test-double-in-prod", "backend/app/a.py", "from unittest.mock import MagicMock\nclient = MagicMock()\n"),
    ("py-print", "backend/app/a.py", "print('debugging')\n"),
    ("as-any", "src/a.ts", "export const a = 1 as any;\n"),
    ("console-call", "src/a.ts", "console.log('x');\n"),
    ("empty-handler", "src/a.tsx", "export const p = { onPress: () => {} };\n"),
    ("layer-boundary", "src/screens/A.tsx", "import { x } from '../services/modules/a/b';\nexport const y = x;\n"),
    ("layer-boundary", "src/components/A.tsx", "import { supabase } from '../services/supabase/client';\nexport const s = supabase;\n"),
]


@pytest.mark.parametrize(("rule", "rel", "content"), STRICT_CASES)
def test_strict_rules_reject_production_code(repo, rule, rel, content):
    write(repo, rel, content)
    result = gate(repo)
    assert result.returncode == 1, result.stdout + result.stderr
    assert f"[{rule}]" in result.stderr


def test_todo_with_an_issue_reference_is_allowed(repo):
    write(repo, "src/a.ts", "// TODO(#123): replace once the API exposes it\nexport const x = 1;\n")
    assert gate(repo).returncode == 0


@pytest.mark.parametrize(
    "rel",
    ["src/a.test.ts", "src/__tests__/a.ts", "src/__mocks__/a.ts", "src/testUtils/a.ts", "backend/tests/a.py"],
)
def test_test_code_is_exempt(repo, rel):
    write(repo, rel, "export const f = jest.fn();\nconst x = 1; // eslint-disable-line\nconsole.log(x);\n// TODO later\n")
    assert gate(repo).returncode == 0


def test_a_strict_hit_blocks_creating_a_baseline(repo):
    write(repo, "src/a.ts", "throw new Error('not implemented');\n")
    result = gate(repo, "--init")
    assert result.returncode == 1
    assert not (repo / "scripts" / "reality-baseline.json").exists()


# ------------------------------------------------------------------ ratchet rules


def test_ratchet_allows_recorded_debt_but_not_growth_in_a_file(repo):
    write(repo, "src/a.ts", "export const a = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0
    assert gate(repo).returncode == 0

    write(repo, "src/a.ts", "export const a = 1; // eslint-disable-line\nexport const b = 2; // eslint-disable-line\n")
    result = gate(repo)
    assert result.returncode == 1
    assert "[lint-disable] src/a.ts: 2 now, 1 allowed" in result.stderr


def test_a_new_file_starts_at_zero(repo):
    write(repo, "src/a.ts", "export const a = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0

    write(repo, "src/new.ts", "export const n = 1; // eslint-disable-line\n")
    result = gate(repo)
    assert result.returncode == 1
    assert "src/new.ts: 1 now, 0 allowed" in result.stderr


def test_fixing_one_file_cannot_mask_a_new_problem_in_another(repo):
    write(repo, "src/a.ts", "export const a = 1; // eslint-disable-line\nexport const a2 = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0

    write(repo, "src/a.ts", "export const a = 1;\n")  # two fewer
    write(repo, "src/b.ts", "export const b = 1; // eslint-disable-line\n")  # one new
    assert gate(repo).returncode == 1  # total went down, but the new file is still refused


def test_update_baseline_records_improvements_and_refuses_increases(repo):
    write(repo, "src/a.ts", "export const a = 1; // eslint-disable-line\nexport const a2 = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0

    write(repo, "src/a.ts", "export const a = 1; // eslint-disable-line\n")
    assert gate(repo, "--update-baseline").returncode == 0
    assert baseline(repo)["rules"]["lint-disable"] == {"src/a.ts": 1}

    write(repo, "src/a.ts", "export const a = 1; // eslint-disable-line\nexport const a2 = 1; // eslint-disable-line\n")
    assert gate(repo, "--update-baseline").returncode == 1
    assert baseline(repo)["rules"]["lint-disable"] == {"src/a.ts": 1}


@pytest.mark.parametrize(
    ("rule", "rel", "content"),
    [
        ("lint-disable", "src/a.ts", "// eslint-disable-next-line no-console\nexport const x = 1;\n"),
        ("broad-except", "backend/app/a.py", "try:\n    f()\nexcept Exception as exc:\n    log(exc)\n"),
    ],
)
def test_each_ratchet_rule_detects_new_debt(repo, rule, rel, content):
    write(repo, "src/clean.ts", "export const ok = 1;\n")
    assert gate(repo, "--init").returncode == 0
    write(repo, rel, content)
    result = gate(repo)
    assert result.returncode == 1
    assert f"[{rule}]" in result.stderr


# ------------------------------------------------------------------ layer boundary and the logger


LAYER_IMPORT = "import { fetchListings } from '../../services/modules/marketplace/listingsService';\nexport const x = fetchListings;\n"
CLEAN = "export const ok = 1;\n"
DEBT = "export const a = 1; // eslint-disable-line\n"


def forget_rule(repo: Path, rule: str) -> None:
    """Rewrite the baseline as it was before `rule` existed."""
    recorded = baseline(repo)
    del recorded["rules"][rule]
    (repo / "scripts" / "reality-baseline.json").write_text(json.dumps(recorded), encoding="utf-8")


@pytest.mark.parametrize("rel", ["src/hooks/api/a.ts", "src/store/a.ts", "src/services/modules/a/b.ts"])
def test_hooks_stores_and_services_are_outside_the_boundary(repo, rel):
    write(repo, rel, LAYER_IMPORT)
    assert gate(repo).returncode == 0


@pytest.mark.parametrize(
    "statement",
    [
        "import { supabase } from '../services/supabase';\nexport const s = supabase;\n",
        "import { apiFetch } from '../services/api/client';\nexport const s = apiFetch;\n",
        "const service = require('../services/modules/a/b');\nexport const s = service;\n",
        "export const load = () => import('../services/modules/a/b');\n",
        "import '../services/supabase/client';\n",
        "import { apiFetch } from '../services/api/client.ts';\n",
        "export * from '../services/modules/a/b';\n",
    ],
)
def test_every_way_of_reaching_the_service_layer_is_caught(repo, statement):
    write(repo, "src/screens/A.tsx", statement)
    result = gate(repo)
    assert result.returncode == 1
    assert "[layer-boundary]" in result.stderr


def test_importing_the_error_types_is_allowed_from_a_screen(repo):
    write(repo, "src/screens/A.tsx", "import type { ApiError } from '../services/api/errors';\nexport type E = ApiError;\n")
    assert gate(repo).returncode == 0


def test_the_layer_boundary_has_no_baseline_to_hide_behind(repo):
    write(repo, "src/screens/A.tsx", LAYER_IMPORT)
    assert gate(repo, "--init").returncode == 1  # a strict rule blocks even the first baseline


def test_the_logger_is_the_only_file_that_may_use_the_console(repo):
    write(repo, "src/utils/logger.ts", "export const log = () => console.warn('x');\n")
    assert gate(repo).returncode == 0
    write(repo, "src/utils/other.ts", "export const log = () => console.warn('x');\n")
    result = gate(repo)
    assert result.returncode == 1
    assert "[console-call]" in result.stderr
    assert "src/utils/other.ts" in result.stderr


def test_a_rule_added_later_records_its_existing_debt_only_when_asked(repo):
    write(repo, "src/a.ts", DEBT)
    assert gate(repo, "--init").returncode == 0
    forget_rule(repo, "lint-disable")

    assert gate(repo).returncode == 1  # the debt is unrecorded, so the rule fails
    assert gate(repo, "--update-baseline").returncode == 1  # and a plain update refuses to record it
    assert gate(repo, "--update-baseline", "--adopt-new-rules").returncode == 0
    assert baseline(repo)["rules"]["lint-disable"] == {"src/a.ts": 1}
    assert gate(repo).returncode == 0


def test_adopting_a_new_rule_never_forgives_growth_in_an_existing_one(repo):
    write(repo, "backend/app/a.py", "try:\n    f()\nexcept Exception as exc:\n    log(exc)\n")
    assert gate(repo, "--init").returncode == 0
    forget_rule(repo, "lint-disable")

    write(repo, "backend/app/a.py", "try:\n    f()\nexcept Exception as exc:\n    log(exc)\ntry:\n    g()\nexcept Exception as exc:\n    log(exc)\n")
    assert gate(repo, "--update-baseline", "--adopt-new-rules").returncode == 1


# ------------------------------------------------------------------ pre-commit mode


def test_files_mode_only_checks_the_named_files(repo):
    write(repo, "src/bad.ts", "throw new Error('not implemented');\n")
    write(repo, "src/good.ts", "export const ok = 1;\n")
    assert gate(repo, "--files", "src/good.ts").returncode == 0
    assert gate(repo, "--files", "src/bad.ts").returncode == 1


def test_a_partial_scan_never_writes_a_baseline(repo):
    write(repo, "src/good.ts", "export const ok = 1;\n")
    assert gate(repo, "--files", "src/good.ts", "--init").returncode == 2


# ------------------------------------------------------------------ tool ratchets


def _module_available(name: str) -> bool:
    return subprocess.run([sys.executable, "-m", name, "--version"], capture_output=True).returncode == 0


@pytest.mark.skipif(not _module_available("ruff"), reason="ruff is not installed in this environment")
def test_ruff_ratchet_rejects_a_new_violation_in_any_file(repo):
    write(repo, "backend/app/ok.py", "VALUE = 1\n")
    assert gate(repo, "--init", "--tools", "ruff").returncode == 0

    write(repo, "backend/app/bad.py", "import os\n")  # F401 unused import
    result = gate(repo, "--tools", "ruff")
    assert result.returncode == 1
    assert "F401:app/bad.py" in result.stderr


@pytest.mark.skipif(not _module_available("mypy"), reason="mypy is not installed in this environment")
def test_mypy_ratchet_rejects_a_new_type_error(repo):
    write(
        repo,
        "backend/pyproject.toml",
        '[tool.mypy]\nfiles = ["app"]\nmypy_path = "."\nexplicit_package_bases = true\n',
    )
    write(repo, "backend/app/ok.py", "VALUE: int = 1\n")
    assert gate(repo, "--init", "--tools", "mypy").returncode == 0

    write(repo, "backend/app/bad.py", "VALUE: int = 'not an int'\n")
    result = gate(repo, "--tools", "mypy")
    assert result.returncode == 1
    assert "assignment:app/bad.py" in result.stderr
