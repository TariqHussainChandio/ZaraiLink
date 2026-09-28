#!/usr/bin/env python3
"""Fails unless a generated folder exists, has files, and matches what is committed.

`npm run api:check` regenerates the API client and then runs this. It replaces `git diff --exit-code -- <folder>`,
which passes when the folder is missing or only has untracked files: after A1 moved the client, the old check would
have compared nothing and stayed green.

    python scripts/ci/check_generated_clean.py frontend/services/api/generated
"""

import subprocess
import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    folder = sys.argv[1]
    root = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, check=True).stdout.strip())
    path = root / folder
    if not path.is_dir() or not any(p.is_file() for p in path.rglob("*")):
        print(f"{folder} is missing or empty: the generator wrote somewhere else", file=sys.stderr)
        return 1
    status = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all", "--", folder], cwd=root, capture_output=True, text=True, check=True
    ).stdout.strip()
    if status:
        print(f"{folder} differs from what is committed; run the generator and commit the result:\n{status}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
