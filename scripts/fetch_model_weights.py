#!/usr/bin/env python3
"""Fetches backend/app/ml/checkpoints/model.pth from Supabase Storage if it is missing or does not match the pinned
checksum.

Why this exists. The trained model (9.3 MB) is application data, and application files live in Supabase Storage
(SRDS §45-§46); Git and GitHub hold source code only. It sits in the private `ml-models` bucket of the hosted
project (migration 20260928080000_ml_models_bucket.sql) and is downloaded through a signed URL, so neither CI nor a
developer needs the project's service key. The script is standard-library only, so it runs unchanged on a Windows
dev machine and on Linux CI (the same rule check_reality.py follows).

Where things come from
- The object's bucket, path and SHA-256 come from model_metadata.json (the checkpoint's own record of itself), so a
  retrain needs a new upload plus an updated metadata file, no code change.
- The signed URL comes from the MODEL_WEIGHTS_URL environment variable, or from backend/.env when it is not set.
  CI reads it from the repository secret of the same name. The script refuses a URL that points at a different
  object than the metadata names, and a file whose checksum does not match.
- Making a new signed URL (it expires): Supabase dashboard → Storage → ml-models → the file → "Get URL", or see
  docs/setup/DEVELOPMENT_SETUP.md.

Usage
    python scripts/fetch_model_weights.py              # fetch only if missing/mismatched
    python scripts/fetch_model_weights.py --force       # always re-download
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKPOINTS_DIR = ROOT / "backend" / "app" / "ml" / "checkpoints"
METADATA_PATH = CHECKPOINTS_DIR / "model_metadata.json"
WEIGHTS_PATH = CHECKPOINTS_DIR / "model.pth"
BACKEND_ENV = ROOT / "backend" / ".env"
URL_VARIABLE = "MODEL_WEIGHTS_URL"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _signed_url() -> str | None:
    """The environment wins; otherwise a `MODEL_WEIGHTS_URL=` line in backend/.env (git-ignored)."""
    value = os.environ.get(URL_VARIABLE)
    if value:
        return value.strip()
    if BACKEND_ENV.exists():
        for line in BACKEND_ENV.read_text(encoding="utf-8").splitlines():
            name, _, rest = line.partition("=")
            if name.strip() == URL_VARIABLE and rest.strip():
                return rest.strip().strip('"').strip("'")
    return None


def _check_url(url: str, bucket: str, path: str) -> None:
    """A signed URL must be HTTPS and name exactly the object the metadata pins."""
    parts = urllib.parse.urlsplit(url)
    expected = f"/storage/v1/object/sign/{bucket}/{path}"
    if parts.scheme != "https" or urllib.parse.unquote(parts.path) != expected or "token=" not in parts.query:
        raise SystemExit(f"error: {URL_VARIABLE} is not a signed URL for {bucket}/{path}")


def _download(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url, timeout=120) as resp, open(dest, "wb") as f:  # noqa: S310 - checked above
        while chunk := resp.read(1024 * 1024):
            f.write(chunk)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--force", action="store_true", help="re-download even if the checksum already matches")
    args = parser.parse_args()

    if not METADATA_PATH.exists():
        print(f"error: {METADATA_PATH} not found", file=sys.stderr)
        return 1

    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    bucket = metadata.get("weights_storage_bucket")
    path = metadata.get("weights_storage_path")
    expected_sha256 = metadata.get("weights_sha256")
    if not bucket or not path or not expected_sha256:
        print(f"error: {METADATA_PATH} does not name the stored weights and their checksum", file=sys.stderr)
        return 1

    if not args.force and WEIGHTS_PATH.exists():
        actual = _sha256(WEIGHTS_PATH)
        if actual == expected_sha256:
            print(f"model.pth already present and checksum-verified ({actual[:12]}...).")
            return 0
        print(
            f"model.pth present but checksum mismatch (have {actual[:12]}..., want {expected_sha256[:12]}...) "
            "— re-downloading."
        )

    url = _signed_url()
    if not url:
        print(
            f"error: set {URL_VARIABLE} (a signed URL for {bucket}/{path}) in the environment or backend/.env; "
            "see docs/setup/DEVELOPMENT_SETUP.md",
            file=sys.stderr,
        )
        return 1
    _check_url(url, bucket, path)

    print(f"Downloading model.pth from Supabase Storage ({bucket}/{path}) ...")
    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = WEIGHTS_PATH.with_suffix(".pth.download")
    try:
        _download(url, tmp_path)
        actual = _sha256(tmp_path)
        if actual != expected_sha256:
            print(
                f"error: downloaded file's checksum {actual} does not match pinned {expected_sha256}", file=sys.stderr
            )
            return 1
        tmp_path.replace(WEIGHTS_PATH)
    finally:
        tmp_path.unlink(missing_ok=True)

    print(f"model.pth downloaded and checksum-verified ({actual[:12]}...).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
