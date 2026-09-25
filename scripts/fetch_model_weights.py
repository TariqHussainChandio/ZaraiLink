#!/usr/bin/env python3
"""Fetches backend/app/ml/checkpoints/model.pth from GitHub Releases if it's missing or doesn't
match the pinned checksum.

Why this exists. `model.pth` (9.3 MB) used to be tracked in git, so every retrain added ~9 MB to
history permanently (finding C5 in docs/process/standardization-plan.md). It's hosted on a
GitHub Release instead now (gate G8) and fetched by this script, which is standard-library only
so it runs unchanged on a Windows dev machine and Linux CI (same rule check_reality.py follows).

The download URL and the expected SHA-256 both come from model_metadata.json — the checkpoint's
own record of itself, not hardcoded here, so a retrain only needs a new release plus an updated
metadata file, no code change (matches how class_names/model_version already work).

Repository visibility: while the repo is private (until the standardization plan's go-public
gate flips it), a plain unauthenticated GET on a release asset 404s — GitHub hides private
assets from anonymous requests rather than returning 401/403. This script tries the plain public
URL first and, if that 404s, retries against the authenticated release-assets API using a token
from GH_TOKEN or GITHUB_TOKEN (GitHub Actions sets one of these automatically; locally, run
`export GH_TOKEN=$(gh auth token)` once — the maintainer's `gh` is already authenticated). Once
the repo is public this fallback is simply never needed.

Usage
    python scripts/fetch_model_weights.py              # fetch only if missing/mismatched
    python scripts/fetch_model_weights.py --force       # always re-download
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHECKPOINTS_DIR = ROOT / "backend" / "app" / "ml" / "checkpoints"
METADATA_PATH = CHECKPOINTS_DIR / "model_metadata.json"
WEIGHTS_PATH = CHECKPOINTS_DIR / "model.pth"

# Matches a GitHub Releases download URL and pulls out owner/repo/tag/filename — everything the
# authenticated-API fallback needs, so nothing beyond the one URL in model_metadata.json has to
# be hardcoded here.
_RELEASE_URL_RE = re.compile(
    r"^https://github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)/releases/download/(?P<tag>[^/]+)/(?P<name>[^/]+)$"
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _download_public(url: str, dest: Path) -> None:
    urllib.request.urlretrieve(url, dest)  # noqa: S310 - fixed, pinned GitHub Releases URL, not user input


def _download_via_authenticated_api(url: str, dest: Path, token: str) -> None:
    """Falls back to this while the repo is private — see the module docstring."""
    match = _RELEASE_URL_RE.match(url)
    if not match:
        raise ValueError(f"weights_source_url is not a github.com releases/download URL: {url}")
    owner, repo, tag, name = match["owner"], match["repo"], match["tag"], match["name"]

    api_headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}
    release_req = urllib.request.Request(
        f"https://api.github.com/repos/{owner}/{repo}/releases/tags/{tag}", headers=api_headers
    )
    with urllib.request.urlopen(release_req, timeout=30) as resp:  # noqa: S310 - fixed api.github.com host
        release = json.load(resp)

    asset = next((a for a in release.get("assets", []) if a["name"] == name), None)
    if asset is None:
        raise LookupError(f"release {tag!r} has no asset named {name!r}")

    asset_req = urllib.request.Request(
        asset["url"], headers={**api_headers, "Accept": "application/octet-stream"}
    )
    with urllib.request.urlopen(asset_req, timeout=120) as resp, open(dest, "wb") as f:  # noqa: S310
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
    url = metadata.get("weights_source_url")
    expected_sha256 = metadata.get("weights_sha256")
    if not url or not expected_sha256:
        print(
            f"error: {METADATA_PATH} has no weights_source_url/weights_sha256 — "
            "this checkpoint was never published to GitHub Releases",
            file=sys.stderr,
        )
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

    print(f"Downloading model.pth from {url} ...")
    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
    tmp_path = WEIGHTS_PATH.with_suffix(".pth.download")
    try:
        try:
            _download_public(url, tmp_path)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
            if not token:
                print(
                    "error: public download got 404 (the repo is likely still private) and no "
                    "GH_TOKEN/GITHUB_TOKEN is set to try the authenticated API. Locally, run: "
                    "export GH_TOKEN=$(gh auth token)",
                    file=sys.stderr,
                )
                return 1
            print("Public URL returned 404 (private repo) — retrying via the authenticated API...")
            _download_via_authenticated_api(url, tmp_path, token)

        actual = _sha256(tmp_path)
        if actual != expected_sha256:
            print(
                f"error: downloaded file's checksum {actual} does not match pinned {expected_sha256}",
                file=sys.stderr,
            )
            return 1

        tmp_path.replace(WEIGHTS_PATH)
    finally:
        tmp_path.unlink(missing_ok=True)

    print(f"model.pth downloaded and checksum-verified ({actual[:12]}...).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
