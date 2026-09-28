#!/usr/bin/env python3
"""Print a coverage report as Markdown, for the GitHub Actions job summary.

Reads either Jest's `json-summary` or coverage.py's JSON report and writes a small table to stdout.
No thresholds here on purpose: until the tests exercise real behaviour rather than mocks (phase
P11), a percentage gate would only reward mocking harder. The number is shown, not enforced.

    python scripts/ci/coverage_summary.py "Frontend (jest)" coverage/coverage-summary.json
    python scripts/ci/coverage_summary.py "Backend (pytest)" backend/coverage.json
"""

import json
import sys
from pathlib import Path


def rows_from_jest(data: dict) -> list[tuple[str, float]]:
    total = data["total"]
    return [(name, total[key]["pct"]) for name, key in (("Statements", "statements"), ("Branches", "branches"), ("Functions", "functions"), ("Lines", "lines"))]


def rows_from_coverage_py(data: dict) -> list[tuple[str, float]]:
    totals = data["totals"]
    rows = [("Statements", totals["percent_covered"])]
    if totals.get("num_branches"):
        rows.append(("Branches", 100.0 * totals["covered_branches"] / totals["num_branches"]))
    return rows


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    title, path = sys.argv[1], Path(sys.argv[2])
    data = json.loads(path.read_text(encoding="utf-8"))
    # A report over zero statements means the collection globs no longer match the source tree (A1 moved it), not
    # that nothing needs testing; fail rather than print a meaningless 100%.
    statements = data["total"]["statements"]["total"] if "total" in data else data["totals"]["num_statements"]
    if not statements:
        print(f"{title}: the coverage report measured no statements; check the coverage paths", file=sys.stderr)
        return 1
    rows = rows_from_jest(data) if "total" in data else rows_from_coverage_py(data)
    print(f"### {title} coverage\n")
    print("| Measure | Covered |\n|---|---|")
    for name, pct in rows:
        print(f"| {name} | {pct:.1f}% |")
    print("\nReported, not enforced: thresholds arrive with the real-stack test suites.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
