"""Reference MCP server configurations for ZaraiLink.

Not consumed by Claude Code directly — Claude Code reads `.mcp.json` (or its
own `claude mcp add` CLI state), not this package. It exists so the
researched, source-verified setup for each MCP server this project actually
needs lives in one reviewable place before any real credential touches this
machine. See README.md for how to turn one of these into a real
`claude mcp add` command.
"""

from __future__ import annotations

from . import context7_mcp, github_mcp, supabase_mcp
from .android_adb_mcp import CANDIDATES as ANDROID_ADB_CANDIDATES
from .android_adb_mcp import PRIORITY as ANDROID_ADB_PRIORITY
from .android_adb_mcp import WHY_NEEDED as ANDROID_ADB_WHY_NEEDED
from .base import McpServerConfig, RequiredSecret

RECOMMENDED: tuple[McpServerConfig, ...] = (
    supabase_mcp.CONFIG,
    context7_mcp.CONFIG,
    github_mcp.CONFIG,
)
"""Servers with one verified, official implementation each. Android/ADB is
deliberately excluded here — see ANDROID_ADB_CANDIDATES, which needs a
human pick, not an assumed default."""

__all__ = [
    "McpServerConfig",
    "RequiredSecret",
    "RECOMMENDED",
    "ANDROID_ADB_CANDIDATES",
    "ANDROID_ADB_PRIORITY",
    "ANDROID_ADB_WHY_NEEDED",
]
