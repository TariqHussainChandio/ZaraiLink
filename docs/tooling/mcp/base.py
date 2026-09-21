"""Shared schema for the MCP server reference configs in this folder.

Nothing in `mcp_configurations/` is live configuration — Claude Code reads
`.mcp.json` (or its own `claude mcp add` CLI state), not these files. This
package exists so the researched, source-verified setup for each MCP server
ZaraiLink actually needs lives in one reviewable place before any real
credential touches this machine or `.mcp.json`. See README.md for how to
turn one of these into a real `claude mcp add` command.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RequiredSecret:
    """A credential the server needs that only the user can create.

    Never holds a literal value — only what the credential is and where to
    get it.
    """

    env_var: str
    description: str
    how_to_obtain: str


@dataclass(frozen=True)
class McpServerConfig:
    name: str
    priority: str
    """"P0" or "P1", matching the ZaraiLink Field Manual's MCP Servers section."""
    why_needed: str
    transport: str
    """"http" (remote, hosted) or "stdio" (local process)."""
    claude_mcp_add_command: str
    """The exact `claude mcp add` invocation, checked against the vendor's own
    docs. Run this yourself in a terminal — not something to be run on your
    behalf without you asking."""
    required_secrets: tuple[RequiredSecret, ...] = field(default_factory=tuple)
    scoping_notes: str = ""
    source_docs: tuple[str, ...] = field(default_factory=tuple)
    caveats: str = ""
    """Anything about this config that wasn't confirmed with full certainty
    against an official source and is worth double-checking before relying
    on it. Empty when there's nothing to flag."""
