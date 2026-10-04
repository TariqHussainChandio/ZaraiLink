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
    ("stub-marker", "frontend/a.ts", "export const f = () => { throw new Error('Not implemented'); };\n"),
    ("stub-marker", "frontend/a.tsx", "export const Label = () => 'Coming soon';\n"),
    ("stub-marker", "backend/app/a.py", "def f():\n    raise NotImplementedError\n"),
    ("todo-without-issue", "frontend/a.ts", "// TODO: fix this later\nexport const x = 1;\n"),
    ("todo-without-issue", "backend/app/a.py", "# FIXME make this real\nx = 1\n"),
    ("empty-catch", "frontend/a.ts", "export const f = () => { try { g(); } catch (e) {} };\n"),
    ("empty-catch", "backend/app/a.py", "try:\n    f()\nexcept ValueError:\n    pass\n"),
    ("ts-suppression", "frontend/a.ts", "// @ts-ignore\nexport const x: number = 'a';\n"),
    ("test-double-in-prod", "frontend/a.ts", "export const send = jest.fn();\n"),
    ("test-double-in-prod", "backend/app/a.py", "from unittest.mock import MagicMock\nclient = MagicMock()\n"),
    ("py-print", "backend/app/a.py", "print('debugging')\n"),
    ("as-any", "frontend/a.ts", "export const a = 1 as any;\n"),
    ("console-call", "frontend/a.ts", "console.log('x');\n"),
    ("empty-handler", "frontend/a.tsx", "export const p = { onPress: () => {} };\n"),
    ("layer-boundary", "frontend/farmer/screens/A.tsx", "import { x } from '../services/modules/a/b';\nexport const y = x;\n"),
    ("layer-boundary", "frontend/common/components/A.tsx", "import { supabase } from '../services/supabase/client';\nexport const s = supabase;\n"),
    ("header-right", "frontend/navigation/stacks/A.tsx", "export const options = { headerRight: () => null };\n"),
    ("header-right", "frontend/navigation/stacks/A.tsx", "export const options = { headerLeft: () => null };\n"),
    ("header-right", "frontend/navigation/stacks/A.tsx", "export const options = { headerTitle: () => null };\n"),
    ("header-right", "frontend/navigation/stacks/A.tsx", "export const options = { headerTitle: LogoTitle };\n"),
    ("header-right", "frontend/navigation/stacks/A.tsx", "export const options = { headerSearchBarOptions: { placeholder: 'Search' } };\n"),
]


@pytest.mark.parametrize(("rule", "rel", "content"), STRICT_CASES)
def test_strict_rules_reject_production_code(repo, rule, rel, content):
    write(repo, rel, content)
    result = gate(repo)
    assert result.returncode == 1, result.stdout + result.stderr
    assert f"[{rule}]" in result.stderr


def test_todo_with_an_issue_reference_is_allowed(repo):
    write(repo, "frontend/a.ts", "// TODO(#123): replace once the API exposes it\nexport const x = 1;\n")
    assert gate(repo).returncode == 0


@pytest.mark.parametrize(
    "rel",
    ["frontend/a.test.ts", "frontend/__tests__/a.ts", "frontend/__mocks__/a.ts", "frontend/testUtils/a.ts", "backend/tests/a.py"],
)
def test_test_code_is_exempt(repo, rel):
    write(repo, rel, "export const f = jest.fn();\nconst x = 1; // eslint-disable-line\nconsole.log(x);\n// TODO later\n")
    assert gate(repo).returncode == 0


def test_the_baseline_is_written_with_lf_line_endings(repo):
    write(repo, "frontend/a.ts", "export const x = 1;\n")
    assert gate(repo, "--init").returncode == 0
    assert b"\r" not in (repo / "scripts" / "reality-baseline.json").read_bytes()


def test_a_strict_hit_blocks_creating_a_baseline(repo):
    write(repo, "frontend/a.ts", "throw new Error('not implemented');\n")
    result = gate(repo, "--init")
    assert result.returncode == 1
    assert not (repo / "scripts" / "reality-baseline.json").exists()


# ------------------------------------------------------------------ ratchet rules


def test_ratchet_allows_recorded_debt_but_not_growth_in_a_file(repo):
    write(repo, "frontend/a.ts", "export const a = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0
    assert gate(repo).returncode == 0

    write(repo, "frontend/a.ts", "export const a = 1; // eslint-disable-line\nexport const b = 2; // eslint-disable-line\n")
    result = gate(repo)
    assert result.returncode == 1
    assert "[lint-disable] frontend/a.ts: 2 now, 1 allowed" in result.stderr


def test_a_new_file_starts_at_zero(repo):
    write(repo, "frontend/a.ts", "export const a = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0

    write(repo, "frontend/new.ts", "export const n = 1; // eslint-disable-line\n")
    result = gate(repo)
    assert result.returncode == 1
    assert "frontend/new.ts: 1 now, 0 allowed" in result.stderr


def test_fixing_one_file_cannot_mask_a_new_problem_in_another(repo):
    write(repo, "frontend/a.ts", "export const a = 1; // eslint-disable-line\nexport const a2 = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0

    write(repo, "frontend/a.ts", "export const a = 1;\n")  # two fewer
    write(repo, "frontend/b.ts", "export const b = 1; // eslint-disable-line\n")  # one new
    assert gate(repo).returncode == 1  # total went down, but the new file is still refused


def test_update_baseline_records_improvements_and_refuses_increases(repo):
    write(repo, "frontend/a.ts", "export const a = 1; // eslint-disable-line\nexport const a2 = 1; // eslint-disable-line\n")
    assert gate(repo, "--init").returncode == 0

    write(repo, "frontend/a.ts", "export const a = 1; // eslint-disable-line\n")
    assert gate(repo, "--update-baseline").returncode == 0
    assert baseline(repo)["rules"]["lint-disable"] == {"frontend/a.ts": 1}

    write(repo, "frontend/a.ts", "export const a = 1; // eslint-disable-line\nexport const a2 = 1; // eslint-disable-line\n")
    assert gate(repo, "--update-baseline").returncode == 1
    assert baseline(repo)["rules"]["lint-disable"] == {"frontend/a.ts": 1}


@pytest.mark.parametrize(
    ("rule", "rel", "content"),
    [
        ("lint-disable", "frontend/a.ts", "// eslint-disable-next-line no-console\nexport const x = 1;\n"),
        ("broad-except", "backend/app/a.py", "try:\n    f()\nexcept Exception as exc:\n    log(exc)\n"),
    ],
)
def test_each_ratchet_rule_detects_new_debt(repo, rule, rel, content):
    write(repo, "frontend/clean.ts", "export const ok = 1;\n")
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


@pytest.mark.parametrize("rel", ["frontend/hooks/a.ts", "frontend/state/a.ts", "frontend/farmer/services/b.ts"])
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
    write(repo, "frontend/farmer/screens/A.tsx", statement)
    result = gate(repo)
    assert result.returncode == 1
    assert "[layer-boundary]" in result.stderr


def test_importing_the_error_types_is_allowed_from_a_screen(repo):
    write(repo, "frontend/farmer/screens/A.tsx", "import type { ApiError } from '../services/api/errors';\nexport type E = ApiError;\n")
    assert gate(repo).returncode == 0


def test_the_layer_boundary_has_no_baseline_to_hide_behind(repo):
    write(repo, "frontend/farmer/screens/A.tsx", LAYER_IMPORT)
    assert gate(repo, "--init").returncode == 1  # a strict rule blocks even the first baseline


def test_a_string_header_title_and_reading_the_option_are_allowed(repo):
    write(
        repo,
        "frontend/navigation/A.tsx",
        "export const o = { headerTitle: 'Orders', title: 'Orders' };\n"
        "export const t = (options: { headerTitle?: unknown; title?: string }) =>\n"
        "  typeof options.headerTitle === 'string' ? options.headerTitle : (options.title ?? '');\n",
    )
    assert gate(repo).returncode == 0


def test_the_logger_is_the_only_file_that_may_use_the_console(repo):
    write(repo, "frontend/utils/logger.ts", "export const log = () => console.warn('x');\n")
    assert gate(repo).returncode == 0
    write(repo, "frontend/utils/other.ts", "export const log = () => console.warn('x');\n")
    result = gate(repo)
    assert result.returncode == 1
    assert "[console-call]" in result.stderr
    assert "frontend/utils/other.ts" in result.stderr


# ------------------------------------------------------------------ raw-style (A2, SRDS §43)


RAW_STYLES = [
    "export const s = { color: '#1A7F4B' };\n",
    "export const s = { color: \"#fff\" };\n",
    "export const s = { backgroundColor: 'rgba(0,0,0,0.5)' };\n",
    "export const s = { borderColor: 'hsl(140, 60%, 30%)' };\n",
    "export const s = { backgroundColor: `${colors.status.danger.mark}1A` };\n",
    "export const s = { fontSize: 14 };\n",
    "export const s = { lineHeight: 20 };\n",
    "export const s = { letterSpacing: 2 };\n",
    "export const s = { padding: 8 };\n",
    "export const s = { marginHorizontal: -4 };\n",
    "export const s = { gap: 12 };\n",
    "export const s = { borderRadius: 999 };\n",
    "export const s = { borderTopWidth: 1 };\n",
    "export const s = { width: 44 };\n",
    "export const s = { maxHeight: 320 };\n",
    "export const s = { top: -6 };\n",
    "export const I = () => <Icon size={22} />;\n",
    "export const I = () => <Icon strokeWidth={3} />;\n",
    "export const P = () => <Pressable hitSlop={8} />;\n",
    # Forms the A2 verifier found passing the first version of the rule.
    "export const Q = () => <QRCode width={200} height={200} />;\n",
    "export const K = () => <KeyboardAvoidingView keyboardVerticalOffset={90} />;\n",
    "export const s = { fontFamily: 'monospace' };\n",
    "export const s = { marginTop: 0.5 };\n",
    "export const s = { borderTopLeftRadius: 12 };\n",
    "export const s = { borderStartWidth: 2 };\n",
    # Forms the A2 verifier's second round found passing.
    "export const s = { color: 'white' };\n",
    "export const I = () => <Icon color=\"black\" />;\n",
    "export const s = { paddingInline: 8 };\n",
    "export const s = { marginBlockStart: 4 };\n",
    "export const s = { insetBlock: 6 };\n",
    "export const s = { borderStartStartRadius: 6 };\n",
    "export const s = { flexBasis: 120 };\n",
    "export const s = { transform: [{ translateY: 8 }] };\n",
    "export const s = { marginTop: +8 };\n",
    "export const s = { marginTop: .5 };\n",
    "export const I = () => <Icon size=\"22\" />;\n",
    "export const C = () => <Row iconSize={22} gap={8} />;\n",
    # Round 3: a case only the size-like-prop pattern catches, and the forms it listed.
    "export const C = () => <Row iconSize={22} />;\n",
    "export const s = { fontWeight: '700' };\n",
    "export const I = () => <Icon size={'24'} />;\n",
    "export const I = () => <Icon color={'black'} />;\n",
    "export const s = { outlineWidth: 2 };\n",
    "export const s = { shadowRadius: 6 };\n",
    # Round 4: each key and weight form on its own, so dropping any one of them fails a test.
    "export const s = { outlineOffset: 2 };\n",
    "export const s = { textShadowRadius: 4 };\n",
    "export const s = { fontWeight: 700 };\n",
    "export const s = { fontWeight: 'bold' };\n",
    # Round 4 (L6): a literal inside a ternary or a colour object, and a colour written as a template string.
    "export const s = { color: active ? 'red' : colors.ink };\n",
    "export const I = () => <Icon color={active ? 'red' : colors.ink} />;\n",
    "export const S = () => <Switch trackColor={{ false: 'gray' }} />;\n",
    "export const S = () => <Switch trackColor={{ false: colors.line, true: 'green' }} />;\n",
    "export const s = { color: `red` };\n",
    "export const I = () => <Icon size={big ? 24 : size.icon} />;\n",
    "export const C = () => <Row iconSize={big ? size.icon : 16} />;\n",
    "export const P = () => <Pressable hitSlop={{ top: 8 }} />;\n",
    "export const s = { padding: dense ? 8 : space[2] };\n",
    # Round 4 re-check: the type styles as a ternary branch too.
    "export const s = { fontSize: big ? 18 : typography.body.fontSize };\n",
    "export const s = { lineHeight: dense ? 18 : 22 };\n",
    "export const s = { letterSpacing: wide ? 1 : 0 };\n",
    "export const s = { fontWeight: selected ? '700' : '400' };\n",
    "export const s = { fontFamily: mono ? 'Courier' : undefined };\n",
    # A literal as a fallback, and a ternary whose condition holds a string.
    "export const s = { fontSize: size ?? 14 };\n",
    "export const s = { fontSize: props.size || 14 };\n",
    "export const s = { color: props.color || 'black' };\n",
    "export const s = { padding: dense && 8 };\n",
    "export const s = { padding: Platform.OS === 'ios' ? 12 : space[2] };\n",
    # The literal in the false branch, after an index or optional chaining, behind a comparison, nested; and props.
    "export const s = { color: active ? colors.ink : 'red' };\n",
    "export const s = { padding: dense ? space[1] : 8 };\n",
    "export const s = { fontSize: big ? typography.scale[3] : 14 };\n",
    "export const s = { padding: insets[edge] ?? 8 };\n",
    "export const s = { fontSize: props?.size ?? 14 };\n",
    "export const s = { padding: count >= 2 ? 8 : space[1] };\n",
    "export const s = { padding: !open ? 8 : space[1] };\n",
    "export const s = { fontSize: big ? sizes.large : small ? 12 : sizes.body };\n",
    "export const I = () => <Icon size={props.size || 22} />;\n",
    "export const C = () => <Row iconSize={compact && 16} />;\n",
    "export const s = { padding: status !== 'paid' ? 8 : space[1] };\n",
    'export const s = { padding: Platform.OS === "ios" ? 12 : space[2] };\n',
    "export const s = { padding: $dense ? 8 : space[1] };\n",
    "export const s = { padding: !!dense ? 8 : space[1] };\n",
]


@pytest.mark.parametrize("content", RAW_STYLES)
def test_raw_style_values_outside_the_theme_are_rejected(repo, content):
    write(repo, "frontend/common/components/A.tsx", content)
    result = gate(repo)
    assert result.returncode == 1, result.stdout + result.stderr
    assert "[raw-style]" in result.stderr


def test_theme_tokens_and_values_outside_the_visual_system_are_allowed(repo):
    write(
        repo,
        "frontend/common/components/A.tsx",
        """\
        export const s = {
          padding: 0, margin: 0, top: 0, flex: 1, opacity: 0.8, zIndex: 2, aspectRatio: 1.5, elevation: 0,
          width: '40%', borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space[2], borderRadius: radius.pill,
          height: size.photoHero, fontSize: typography.body.fontSize, color: colors.ink,
        };
        export const I = () => <Icon size={theme.size.iconMd} strokeWidth={theme.size.iconStroke} />;
        export const t = { color: active ? colors.accent : colors.ink, backgroundColor: on ? colors.soft : 'transparent' };
        export const u = { padding: dense ? space[1] : 0, color: `${colors.ink}` };
        export const S = () => <Switch trackColor={{ false: colors.line, true: accent.fill }} />;
        export const J = () => <Icon size={big ? size.iconLg : size.icon} />;
        export const K = () => <Icon color={c} name={open ? 'chevron-up' : 'chevron-down'} />;
        export const L = () => <Text style={{ color: colors.ink }} accessibilityLabel={on ? 'on' : 'off'} />;
        export const M = () => <Text style={[styles.x, { marginTop: space[1] }]} numberOfLines={open ? undefined : 2} />;
        export const hours = { start: '09:00', end: '17:00' };
        export const columnsFor = (width: number) => (width >= 600 ? 3 : 2);
        export const badgeFor = (color: Tone) => color === 'danger' ? 'solid' : 'soft';
        export const contrastFor = (color: string): 'light' | 'dark' => (dark ? 'light' : 'dark');
        export const grid = { width: w, columns: wide ? 3 : 2 };
        let width: number; const cols = wide ? 3 : 2;
        let height: number
        const rows = tall ? 3 : 2
        export const idx = { padding: space[dense ? 1 : 2], marginTop: space[level ?? 2] };
        export const pick = { color: colors[selected ? 'accent' : 'ink'] };
        export const color: Tone = isError ? 'danger' : 'neutral';
        export const slot = { start: early ? '08:30' : '09:30' };
        export const V = () => <View backgroundColor="transparent" />;
        export const W = () => <Switch trackColor={{ false: 'transparent', true: accent.fill }} />;
        const end: number = hasMore ? 1 : 0;
        function choose(color: Tone = tone ?? 'neutral') {}
        export const call = { color: colorFor(dark ? 'ink' : 'paper'), padding: scale(dense ? 1 : 2) };
        export const pct = { width: `${half ? 50 : 100}%` };
        export const N = () => <KeyboardAvoidingView keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0} />;
        export const O = () => <Grid itemWidth={width / (wide ? 3 : 2)} />;
        export const Q = () => <Icon size={sizes[big ? 1 : 0]} />;
        export const step = { start: index > 0 ? index - 1 : 0 };
        """,
    )
    assert gate(repo).returncode == 0


def test_a_long_chain_of_operators_is_read_in_linear_time(repo):
    # Two `[ \t]*` side by side in the ternary grammar once made each operator double the work: 22 chained `??` with no
    # literal at the end took 7.6 s. 400 of them must now finish well inside the timeout.
    chains = [
        "padding: " + " ?? ".join(["a"] * 400),
        "padding: " + "a ? b : " * 400 + "space[1]",
        "padding: " + "a!==b?b:" * 400,
    ]
    lines = "".join(f"export const s{i} = {{ {chain} }};\n" for i, chain in enumerate(chains))
    write(repo, "frontend/common/components/A.tsx", lines)
    result = subprocess.run(
        [sys.executable, "scripts/check_reality.py"],
        cwd=repo,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
    )
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize("rel", ["frontend/theme/colors.ts", "frontend/theme/nested/palette.ts", "frontend/a.test.tsx"])
def test_the_theme_folder_and_tests_may_hold_raw_values(repo, rel):
    write(repo, rel, "export const green = { mark: '#1A7F4B', fontSize: 14, padding: 8 };\n")
    assert gate(repo).returncode == 0


def test_the_app_entry_is_in_scope_and_nothing_outside_the_app_is(repo):
    write(repo, "App.tsx", "export const s = { fontSize: 14 };\n")
    assert "[raw-style]" in gate(repo).stderr
    (repo / "App.tsx").unlink()
    write(repo, "scripts/tool.ts", "export const s = { fontSize: 14 };\n")
    assert gate(repo).returncode == 0


def test_raw_style_has_no_baseline_to_hide_behind(repo):
    write(repo, "frontend/common/components/A.tsx", "export const s = { padding: 8 };\n")
    assert gate(repo, "--init").returncode == 1


def test_a_rule_added_later_records_its_existing_debt_only_when_asked(repo):
    write(repo, "frontend/a.ts", DEBT)
    assert gate(repo, "--init").returncode == 0
    forget_rule(repo, "lint-disable")

    assert gate(repo).returncode == 1  # the debt is unrecorded, so the rule fails
    assert gate(repo, "--update-baseline").returncode == 1  # and a plain update refuses to record it
    assert gate(repo, "--update-baseline", "--adopt-new-rules").returncode == 0
    assert baseline(repo)["rules"]["lint-disable"] == {"frontend/a.ts": 1}
    assert gate(repo).returncode == 0


def test_adopting_a_new_rule_never_forgives_growth_in_an_existing_one(repo):
    write(repo, "backend/app/a.py", "try:\n    f()\nexcept Exception as exc:\n    log(exc)\n")
    assert gate(repo, "--init").returncode == 0
    forget_rule(repo, "lint-disable")

    write(repo, "backend/app/a.py", "try:\n    f()\nexcept Exception as exc:\n    log(exc)\ntry:\n    g()\nexcept Exception as exc:\n    log(exc)\n")
    assert gate(repo, "--update-baseline", "--adopt-new-rules").returncode == 1


# ------------------------------------------------------------------ pre-commit mode


def test_files_mode_only_checks_the_named_files(repo):
    write(repo, "frontend/bad.ts", "throw new Error('not implemented');\n")
    write(repo, "frontend/good.ts", "export const ok = 1;\n")
    assert gate(repo, "--files", "frontend/good.ts").returncode == 0
    assert gate(repo, "--files", "frontend/bad.ts").returncode == 1


def test_a_partial_scan_never_writes_a_baseline(repo):
    write(repo, "frontend/good.ts", "export const ok = 1;\n")
    assert gate(repo, "--files", "frontend/good.ts", "--init").returncode == 2


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


# ------------------------------------------------------------------ module boundary (A1)


def boundary(repo: Path) -> subprocess.CompletedProcess[str]:
    return gate(repo)


def test_a_module_may_use_another_only_through_its_index(repo):
    write(repo, "frontend/farmer/hooks/farms.ts", "export const useFarms = () => 1;\n")
    write(repo, "frontend/farmer/index.ts", "export { useFarms } from './hooks/farms';\n")
    write(repo, "frontend/admin/screens/A.tsx", "import { useFarms } from '../../farmer';\nexport const a = useFarms;\n")
    assert boundary(repo).returncode == 0  # allowed: the public entry point

    write(repo, "frontend/admin/screens/A.tsx", "import { useFarms } from '../../farmer/hooks/farms';\nexport const a = useFarms;\n")
    result = boundary(repo)
    assert result.returncode == 1
    assert "[module-boundary]" in result.stderr
    assert "frontend/admin/screens/A.tsx" in result.stderr


def test_shared_code_uses_a_module_only_as_types(repo):
    write(repo, "frontend/common/orders/types/orders.ts", "export interface Order { id: string }\n")
    write(repo, "frontend/common/orders/hooks/orders.ts", "export const useOrders = () => 1;\n")
    write(
        repo,
        "frontend/common/orders/index.ts",
        "export { useOrders } from './hooks/orders';\nexport type { Order } from './types/orders';\n",
    )
    write(repo, "frontend/state/cart.ts", "import type { Order } from '../common/orders';\nexport type O = Order;\n")
    assert boundary(repo).returncode == 0

    write(repo, "frontend/state/cart.ts", "import { useOrders } from '../common/orders';\nexport const u = useOrders;\n")
    assert "[module-boundary]" in boundary(repo).stderr


def test_navigation_mounts_module_screens_directly(repo):
    write(repo, "frontend/farmer/screens/Farm.tsx", "export const Farm = () => null;\n")
    write(repo, "frontend/navigation/stacks/App.tsx", "import { Farm } from '../../farmer/screens/Farm';\nexport const s = Farm;\n")
    assert boundary(repo).returncode == 0


@pytest.mark.parametrize(
    "barrel",
    [
        "export * from './hooks/farms';\n",
        "export { useOrders } from '../common/orders/hooks/orders';\n",
    ],
)
def test_a_barrel_re_exports_only_its_own_files_by_name(repo, barrel):
    write(repo, "frontend/farmer/hooks/farms.ts", "export const useFarms = () => 1;\n")
    write(repo, "frontend/common/orders/hooks/orders.ts", "export const useOrders = () => 1;\n")
    write(repo, "frontend/farmer/index.ts", barrel)
    assert "[module-boundary]" in boundary(repo).stderr


def test_no_runtime_cycle_runs_through_a_barrel(repo):
    write(repo, "frontend/common/orders/hooks/orders.ts", "import { pay } from '../../payments';\nexport const order = () => pay;\n")
    write(repo, "frontend/common/orders/index.ts", "export { order } from './hooks/orders';\n")
    write(repo, "frontend/common/payments/hooks/payments.ts", "import { order } from '../../orders';\nexport const pay = () => order;\n")
    write(repo, "frontend/common/payments/index.ts", "export { pay } from './hooks/payments';\n")
    result = boundary(repo)
    assert "runtime import cycle through this barrel" in result.stderr


def test_a_screen_cannot_reach_a_service_through_another_modules_barrel(repo):
    write(repo, "frontend/farmer/services/farmService.ts", "export const fetchFarms = () => 1;\n")
    write(repo, "frontend/farmer/index.ts", "export { fetchFarms } from './services/farmService';\n")
    write(repo, "frontend/admin/hooks/admin.ts", "import { fetchFarms } from '../../farmer';\nexport const f = fetchFarms;\n")
    assert boundary(repo).returncode == 0  # hooks may call another module's service
    write(repo, "frontend/admin/screens/A.tsx", "import { fetchFarms } from '../../farmer';\nexport const f = fetchFarms;\n")
    assert "[module-boundary]" in boundary(repo).stderr


def test_a_backend_module_uses_another_only_through_its_service_or_schemas(repo):
    write(repo, "backend/app/common/orders/service.py", "def orders():\n    return []\n")
    write(repo, "backend/app/common/orders/repository.py", "def rows():\n    return []\n")
    write(repo, "backend/app/admin/service.py", "from app.common.orders import service as orders_service\n\nX = orders_service\n")
    assert boundary(repo).returncode == 0

    write(repo, "backend/app/admin/service.py", "from app.common.orders import repository as orders_repo\n\nX = orders_repo\n")
    result = boundary(repo)
    assert result.returncode == 1
    assert "backend/app/admin/service.py" in result.stderr


def test_shared_backend_code_never_imports_a_module(repo):
    write(repo, "backend/app/common/orders/service.py", "def orders():\n    return []\n")
    write(repo, "backend/app/common/rows.py", "from app.common.orders import service\n\nX = service\n")
    assert "[module-boundary]" in boundary(repo).stderr


# Each form below once passed the rule unseen (found by the A1 verification, 2026-09-28).
FARMER_SERVICE = ("frontend/farmer/services/farmService.ts", "export const fetchFarms = () => 1;\n")
FARMER_BARREL = ("frontend/farmer/index.ts", "export { fetchFarms } from './services/farmService';\n")


@pytest.mark.parametrize(
    "rel, text",
    [
        ("frontend/admin/x.ts", "const m = require('../farmer/services/farmService');\nexport const f = m;\n"),
        ("frontend/admin/x.ts", "export const load = () => import('../farmer/services/farmService');\n"),
        ("frontend/admin/x.ts", "import '../farmer/services/farmService';\n"),
        ("App.tsx", "import { fetchFarms } from './frontend/farmer/services/farmService';\nexport const f = fetchFarms;\n"),
        # A namespace import may use every name, services included.
        ("frontend/admin/screens/A.tsx", "import * as Farmer from '../../farmer';\nexport const f = Farmer.fetchFarms;\n"),
        # A module's own files import each other directly, never through its barrel.
        ("frontend/farmer/screens/F.tsx", "import { fetchFarms } from '..';\nexport const f = fetchFarms;\n"),
        # No semicolons: the runtime import must not hide behind the `type` of the line before.
        (
            "frontend/state/x.ts",
            "import type { ReactNode } from 'react'\nimport { fetchFarms } from '../farmer'\nexport const f = fetchFarms\n",
        ),
    ],
    ids=["require", "dynamic-import", "bare-import", "entry-file", "namespace-import", "own-barrel", "no-semicolons"],
)
def test_every_way_of_loading_a_frontend_file_is_checked(repo, rel, text):
    write(repo, *FARMER_SERVICE)
    write(repo, *FARMER_BARREL)
    write(repo, rel, text)
    result = boundary(repo)
    assert result.returncode == 1
    assert "[module-boundary]" in result.stderr


# Found by the second round of the A1 verification: forms Metro still resolves but the gate could not read.
@pytest.mark.parametrize(
    "rel, text",
    [
        ("frontend/admin/x.ts", "export const load = () => import(`../farmer/services/farmService`);\n"),
        ("frontend/admin/x.ts", "export const load = () => import('../farmer/' + 'services/farmService');\n"),
        ("frontend/admin/x.ts", "const FARM = '../farmer/services/farmService';\nexport const load = () => import(FARM);\n"),
        (
            "frontend/admin/x.ts",
            "const FARM = '../farmer/services/farmService';\nexport function load(flag: boolean) {\n  if (flag) import(FARM);\n}\n",
        ),
        ("frontend/admin/x.ts", "const m = require(`../farmer/services/farmService`);\nexport const f = m;\n"),
        ("frontend/admin/x.ts", "import { 'fetchFarms' as f } from '../farmer/services/farmService';\nexport const g = f;\n"),
        ("frontend/admin/x.ts", "import { fetchFarms } from '..\\u002Ffarmer/services/farmService';\nexport const f = fetchFarms;\n"),
        # `/*` inside a regular expression once read as a comment that ran to the end of the file.
        (
            "frontend/admin/x.ts",
            "export const trim = (p: string) => p.replace(/^\\/*/, '');\n"
            "export { fetchFarms } from '../farmer/services/farmService';\n",
        ),
        # Shared code may not pass a module's exports on to modules that may not import them.
        ("frontend/navigation/farm.ts", "export { fetchFarms } from '../farmer';\n"),
    ],
    ids=["template", "concatenated", "variable", "after-if", "require-template", "quoted-name", "escaped",
         "regex-literal", "navigation-re-export"],
)
def test_an_import_the_gate_cannot_read_or_follow_is_refused(repo, rel, text):
    write(repo, *FARMER_SERVICE)
    write(repo, *FARMER_BARREL)
    write(repo, rel, text)
    result = boundary(repo)
    assert result.returncode == 1
    assert "[module-boundary]" in result.stderr


# Third round of the A1 verification: a JSX line that once flipped the reader's quote state, and a two-step re-export.
JSX_THEN_URL = (
    "import React from 'react';\n"
    "import { Text, View } from 'react-native';\n"
    "export const Row = ({ n }: { n: number }) => (\n"
    "  <View>\n"
    "    <View style={{ width: n }} /><Text>{'km/h'}</Text>\n"
    "  </View>\n"
    ");\n"
)


@pytest.mark.parametrize(
    "rel, text",
    [
        (
            "frontend/admin/Row.tsx",
            JSX_THEN_URL + "const HELP = 'https://zarailink.example/help'; "
            "export { fetchFarms } from '../farmer/services/farmService';\nexport const help = HELP;\n",
        ),
        ("frontend/navigation/farm.ts", "import { fetchFarms } from '../farmer';\nexport { fetchFarms };\n"),
    ],
    ids=["jsx-then-url", "navigation-two-step-re-export"],
)
def test_a_jsx_line_or_a_two_step_re_export_hides_nothing(repo, rel, text):
    write(repo, *FARMER_SERVICE)
    write(repo, *FARMER_BARREL)
    write(repo, rel, text)
    result = boundary(repo)
    assert result.returncode == 1
    assert "[module-boundary]" in result.stderr


def test_ui_copy_that_reads_like_an_import_is_not_one(repo):
    write(repo, *FARMER_SERVICE)
    write(repo, *FARMER_BARREL)
    write(
        repo,
        "frontend/admin/screens/Docs.tsx",
        "export const Docs = () => <Text>Documents we require (CNIC and licence)</Text>;\n"
        "export const failed = 'We could not import (CSV) your file';\n",
    )
    # After the JSX line, a comment is still a comment. (Outside screens/: the older `layer-boundary` text rule still
    # reads comments there.)
    write(repo, "frontend/admin/Row.tsx", JSX_THEN_URL + "// import { fetchFarms } from '../farmer/services/farmService';\n")
    result = boundary(repo)
    assert result.returncode == 0, result.stderr


def test_regular_expressions_jsx_and_comments_do_not_confuse_the_reader(repo):
    write(repo, *FARMER_SERVICE)
    write(repo, *FARMER_BARREL)
    write(
        repo,
        "frontend/admin/hooks/x.tsx",
        "import { fetchFarms } from '../../farmer';\n"
        "// import { fetchFarms } from '../../farmer/services/farmService';\n"
        "export const trim = (p: string) => p.replace(/^\\/*/, '').split(/\\/\\//);\n"
        "export const View = () => <Text>{`a ${1 / 2}`}</Text>;\n"
        "export const f = fetchFarms;\n",
    )
    assert boundary(repo).returncode == 0


def test_the_entry_file_may_use_a_barrel_at_runtime(repo):
    write(repo, *FARMER_SERVICE)
    write(repo, *FARMER_BARREL)
    write(repo, "App.tsx", "import { fetchFarms } from './frontend/farmer';\nexport const f = fetchFarms;\n")
    assert boundary(repo).returncode == 0


@pytest.mark.parametrize(
    "text, allowed",
    [
        ("import app.farmer.repository\n\nX = app.farmer.repository\n", False),
        ("from ..farmer import repository\n\nX = repository\n", False),
        ("from app import farmer\n\nX = farmer\n", False),
        ("import app.farmer.service\n\nX = app.farmer.service\n", True),
        ("from ..farmer import service\n\nX = service\n", True),
        ("from . import repository\n\nX = repository\n", True),  # its own repository
    ],
    ids=["import-repository", "relative-repository", "from-app-import", "import-service", "relative-service", "own"],
)
def test_every_backend_import_form_is_checked(repo, text, allowed):
    _backend_modules(repo)
    write(repo, "backend/app/admin/service.py", text)
    result = boundary(repo)
    assert (result.returncode == 0) is allowed, result.stderr


def _backend_modules(repo: Path) -> None:
    # A service binds its repository as `repo`, as every service in the app does, and imports its models.
    write(
        repo,
        "backend/app/farmer/service.py",
        "from app.farmer import repository as repo\nfrom app.farmer.schemas import FarmInput\n\n\n"
        "def farms(data: FarmInput):\n    return repo.rows()\n",
    )
    write(repo, "backend/app/farmer/schemas.py", "class FarmInput:\n    pass\n")
    write(repo, "backend/app/farmer/repository.py", "def rows():\n    return []\n")
    write(repo, "backend/app/admin/repository.py", "def rows():\n    return []\n")


@pytest.mark.parametrize(
    "text, allowed",
    [
        ("from app.farmer.service import repo\n\nX = repo.rows\n", False),
        ("from app.farmer import service as farmer_service\n\nX = farmer_service.repo.rows\n", False),
        ("import app.farmer.service\n\nX = app.farmer.service.repo.rows\n", False),
        ("import app\n\nX = app.farmer.repository.rows\n", False),
        ("import importlib\n\nX = importlib.import_module('app.farmer.repository')\n", False),
        ("X = __import__('app.farmer.repository')\n", False),
        ("import builtins\n\nX = builtins.__import__('app.farmer.repository')\n", False),
        ("from app.farmer import service as farmer_service\n\nX = farmer_service.farms\n", True),
        # A model the service imports from schemas is a public type, reachable either way.
        ("from app.farmer.service import FarmInput\n\nX = FarmInput\n", True),
        ("from app.farmer import service as farmer_service\n\nX = farmer_service.FarmInput\n", True),
    ],
    ids=["import-alias", "attribute-alias", "attribute-dotted", "attribute-module", "importlib", "dunder-import",
         "builtins-import", "service-function", "schema-through-service", "schema-attribute"],
)
def test_a_backend_module_cannot_reach_past_another_modules_service(repo, text, allowed):
    _backend_modules(repo)
    write(repo, "backend/app/admin/service.py", text)
    result = boundary(repo)
    assert (result.returncode == 0) is allowed, result.stderr


# ------------------------------------------------------------------ silent-breakage guards (A1)


def test_a_gate_that_scans_no_frontend_file_fails(repo):
    write(repo, "package.json", "{}\n")
    write(repo, "src/a.ts", "export const a = 1;\n")  # a source file the gate does not look at
    result = gate(repo)
    assert result.returncode == 1
    assert "[scan]" in result.stderr


def test_the_entry_files_alone_do_not_count_as_a_scanned_frontend(repo):
    write(repo, "package.json", "{}\n")
    write(repo, "App.tsx", "export const App = () => null;\n")
    result = gate(repo)
    assert result.returncode == 1
    assert "[scan]" in result.stderr


def test_a_baseline_entry_for_a_missing_file_fails(repo):
    write(repo, "frontend/a.ts", DEBT)
    assert gate(repo, "--init").returncode == 0
    (repo / "frontend" / "a.ts").rename(repo / "frontend" / "b.ts")
    result = gate(repo)
    assert result.returncode == 1
    assert "[baseline] lint-disable: frontend/a.ts no longer exists" in result.stderr
