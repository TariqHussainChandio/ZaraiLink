"""Android/ADB MCP — P1, unverified candidates.

Unlike Supabase/Context7/GitHub, no single official Android/ADB MCP server
exists. These are community projects found during research, not a picked
recommendation — read the source of whichever one gets chosen before
granting it real device control, since none of them carry the vendor
provenance the other three configs in this folder do.
"""

from __future__ import annotations

from dataclasses import dataclass

PRIORITY = "P1"

WHY_NEEDED = (
    "The app has never been build-verified on a real Android device or "
    "emulator (a standing gap in the ZaraiLink Field Manual's Critical "
    "Path). Device control from Claude Code would let Claude install a "
    "debug build, walk the navigation tree per role, and capture "
    "screenshots directly, instead of that verification staying "
    "manual-only."
)


@dataclass(frozen=True)
class CandidateServer:
    name: str
    repo_url: str
    note: str


CANDIDATES: tuple[CandidateServer, ...] = (
    CandidateServer(
        name="minhalvp/android-mcp-server",
        repo_url="https://github.com/minhalvp/android-mcp-server",
        note=(
            "ADB-based Android device control — screenshots, taps, text "
            "input, app install/launch."
        ),
    ),
    CandidateServer(
        name="AlexGladkov/claude-in-mobile",
        repo_url="https://github.com/AlexGladkov/claude-in-mobile",
        note=(
            "Covers Android (ADB), iOS Simulator (simctl), and desktop "
            "(Compose Multiplatform) — broader scope than ADB-only, worth "
            "it only if iOS support returns."
        ),
    ),
    CandidateServer(
        name="landicefu/android-adb-mcp-server",
        repo_url="https://github.com/landicefu/android-adb-mcp-server",
        note="Another ADB-focused option, smaller footprint.",
    ),
)
