"""Write the backend's OpenAPI document to backend/openapi.json (P7 7A). No server and no database are needed.

The mobile client in frontend/services/api/generated is generated from this file, and CI regenerates both and fails if either differs
from what is committed, so the API and the app cannot drift apart. Run from `backend/` so its virtualenv is used:

    cd backend && uv run python ../scripts/export_openapi.py            # rewrite backend/openapi.json
    cd backend && uv run python ../scripts/export_openapi.py --check    # exit 1 if the committed file is stale

Settings are placeholders: building the spec never contacts Supabase.
"""

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "backend" / "openapi.json"


def build() -> str:
    for name in ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"):
        os.environ.setdefault(name, "http://localhost:54321" if name == "SUPABASE_URL" else "placeholder")
    sys.path.insert(0, str(ROOT / "backend"))
    from app.main import app  # noqa: PLC0415  (needs the settings set just above)

    return json.dumps(app.openapi(), indent=2, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    text = build()
    if "--check" in argv:
        current = TARGET.read_text(encoding="utf-8").replace("\r\n", "\n") if TARGET.exists() else ""
        if current != text:
            print("backend/openapi.json is stale; run: cd backend && uv run python ../scripts/export_openapi.py")
            return 1
        print("backend/openapi.json is up to date")
        return 0
    TARGET.write_text(text, encoding="utf-8", newline="\n")
    print(f"wrote {TARGET} ({len(text.splitlines())} lines)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
