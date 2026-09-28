#!/usr/bin/env bash
# Plants ONE deliberate violation per CI gate, so you can prove on a real pull request that each gate
# turns red. Run it on a THROWAWAY branch, push, open a draft pull request, confirm every job named below
# fails for the planted reason, then close the PR and delete the branch. Never merge it.
#
#   git switch -c gate-proof
#   bash scripts/ci/plant-violations.sh          # plants everything
#   bash scripts/ci/plant-violations.sh secret   # or just the gates you name
#   git add -A && git commit -m "test: plant one violation per gate" && git push -u origin gate-proof
#
# The PR title should be something that is NOT a Conventional Commit, for example "bad title", to prove
# the title check as well. The fake token is assembled at run time so this file never contains a secret.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
mkdir -p frontend/admin frontend/farmer backend/app .github/workflows

plant_reality() {   # job: Reality gate
  printf "export const notReal = () => { throw new Error('not implemented'); };\n" > frontend/plantedStub.ts
}
plant_boundary() { # job: Reality gate (module-boundary: one module reaching into another's files)
  printf "export const planted = 1;\n" > frontend/farmer/plantedInternal.ts
  printf "import { planted } from '../farmer/plantedInternal';\nexport const reach = planted;\n" > frontend/admin/plantedReach.ts
}
plant_eslint() {    # job: Frontend (lint-warning ratchet)
  printf '/* eslint-disable */\nexport const plantedLint = 1;\n' > frontend/plantedEslint.ts
}
plant_knip() {      # job: Frontend (dead-code ratchet)
  printf 'export const plantedOrphan = 1;\n' > frontend/plantedOrphan.ts
}
plant_ruff() {      # job: Backend (ruff ratchet)
  printf 'import os\n\nVALUE = 1\n' > backend/app/planted_lint.py
}
plant_mypy() {      # job: Backend (mypy ratchet)
  printf "PLANTED: int = 'not an int'\n" > backend/app/planted_types.py
}
plant_secret() {    # job: Secrets and known vulnerabilities (gitleaks)
  local prefix="ghp_" body="R7kQ2mZx9LpT4vNb8YcD1sWfH6uJ3aXe0GtE"
  printf 'export const plantedToken = "%s%s";\n' "$prefix" "$body" > frontend/plantedSecret.ts
}
plant_osv() {       # job: Secrets and known vulnerabilities (OSV): drop the torch acceptance
  local py
  py="$(command -v python || command -v python3)"
  "$py" - <<'PY'
import pathlib, re
p = pathlib.Path("osv-scanner.toml")
blocks = re.split(r"(?=\[\[PackageOverrides\]\])", p.read_text(encoding="utf-8"))
p.write_text("".join(b for b in blocks if 'name = "torch"' not in b), encoding="utf-8")
PY
}
plant_semgrep() {   # job: Static analysis
  printf 'import subprocess\n\n\ndef run(name: str) -> None:\n    subprocess.call("report " + name, shell=True)\n' > backend/app/planted_shell.py
}
plant_workflow() {  # job: Workflow lint
  cat > .github/workflows/planted.yml <<'EOF'
name: planted
on:
  pull_request_target:
permissions: write-all
jobs:
  x:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "${{ github.event.pull_request.title }}"
EOF
}

gates=(reality boundary eslint knip ruff mypy secret osv semgrep workflow)
[ "$#" -gt 0 ] && gates=("$@")
for gate in "${gates[@]}"; do
  "plant_${gate}"
  echo "planted: ${gate}"
done
echo
echo "Expected to FAIL: Reality gate, Frontend, Backend, Secrets and known vulnerabilities, Static analysis,"
echo "Workflow lint, and (with a non-conventional PR title) Pull request title. ci-required must be red."
