"""Every path the CI and the tooling name must exist, so a moved folder turns a check red instead of silently off.

A1 moved src/ to frontend/. Several checks match paths as text (CI change detection, the Semgrep targets, the Jest
coverage globs, the generated client's location); pointed at a folder that no longer exists they pass while checking
nothing. These tests read the real files.

    python -m pytest scripts/test_ci_paths.py
"""

import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")


def change_filter(name: str) -> re.Pattern:
    match = re.search(rf'echo "{name}=\$\(match \'(?P<rx>[^\']+)\'\)"', CI)
    assert match, f"no change filter named {name} in ci.yml"
    return re.compile(match["rx"])


@pytest.mark.parametrize(
    ("area", "path"),
    [
        ("frontend", "frontend/common/orders/hooks/orders.ts"),
        ("frontend", "frontend/services/api/client.ts"),
        ("frontend", "App.tsx"),
        # A2: app.config.ts is type-checked by its own program (npm run typecheck runs both).
        ("frontend", "tsconfig.node.json"),
        ("android", "frontend/navigation/stacks/RootNavigator.tsx"),
        ("backend", "backend/app/common/orders/service.py"),
        ("database", "supabase/migrations/20260928090000_admin_write_scope.sql"),
    ],
)
def test_change_detection_sees_a_change_in_each_area(area, path):
    assert (ROOT / path).exists(), f"{path} is a sample of the {area} area and must exist"
    assert change_filter(area).search(path), f"a change to {path} would skip the {area} jobs"


def test_no_check_still_names_the_old_source_folder():
    assert "src/" not in CI, "ci.yml still names src/, which A1 moved to frontend/"


def test_static_analysis_targets_exist():
    match = re.search(r"semgrep scan[\s\S]*?--quiet\s*\n\s*(?P<targets>[^\n]+)", CI)
    assert match, "no semgrep targets found in ci.yml"
    for target in match["targets"].split():
        assert (ROOT / target).exists(), f"semgrep target {target} does not exist"


def test_the_generated_client_is_where_the_generator_and_the_checks_look():
    config = (ROOT / "openapi-ts.config.ts").read_text(encoding="utf-8")
    output = re.search(r"path:\s*'\./(?P<p>[^']+)'", config)["p"]
    assert (ROOT / output / "index.ts").is_file(), f"openapi-ts writes to {output}, which has no client"
    scripts = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))["scripts"]
    assert output in scripts["api:check"], "api:check must check the folder the generator writes"


def test_jest_coverage_globs_match_source_files():
    config = (ROOT / "jest.config.js").read_text(encoding="utf-8")
    includes = re.findall(r"'([^'!][^']*\*[^']*)'", config[config.index("collectCoverageFrom") :].split("]")[0])
    assert includes, "no collectCoverageFrom globs found"
    for glob in includes:
        root = glob.split("/")[0]
        assert any((ROOT / root).rglob("*.ts*")), f"coverage glob {glob} matches no source files"
