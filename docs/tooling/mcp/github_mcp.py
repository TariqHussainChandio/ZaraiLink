"""GitHub MCP — P1.

Official (github/github-mcp-server). Verified against
https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md.
"""

from __future__ import annotations

from .base import McpServerConfig, RequiredSecret

CONFIG = McpServerConfig(
    name="github",
    priority="P1",
    why_needed=(
        "Structured, permission-scoped GitHub tool calls — PRs, issues, "
        "Actions, Dependabot, code scanning — on top of what the `gh` CLI "
        "already covers via the Bash tool. Not a blocking gap; add when "
        "richer PR-review or Actions-visibility workflows are actually "
        "wanted."
    ),
    transport="http",
    claude_mcp_add_command=(
        "claude mcp add-json github "
        "'{\"type\":\"http\",\"url\":\"https://api.githubcopilot.com/mcp\","
        "\"headers\":{\"Authorization\":\"Bearer $GITHUB_PAT\"}}'"
    ),
    required_secrets=(
        RequiredSecret(
            env_var="GITHUB_PAT",
            description=(
                "A GitHub Personal Access Token with access to this "
                "repository."
            ),
            how_to_obtain=(
                "https://github.com/settings/personal-access-tokens — "
                "create a fine-grained token scoped to the ZaraiLink "
                "repository only, not a classic all-repo token."
            ),
        ),
    ),
    scoping_notes=(
        "Use a fine-grained PAT scoped to this one repository — broader "
        "account-wide access isn't needed here. A local Docker-based "
        "alternative also exists "
        "(`ghcr.io/github/github-mcp-server`, `GITHUB_PERSONAL_ACCESS_TOKEN` "
        "env var, `claude mcp add github -e GITHUB_PERSONAL_ACCESS_TOKEN=... "
        "-- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN "
        "ghcr.io/github/github-mcp-server`) if the hosted remote endpoint "
        "isn't preferred — see source docs for the full command."
    ),
    source_docs=(
        "https://github.com/github/github-mcp-server",
        "https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-claude.md",
    ),
    caveats=(
        "The docs page also shows a slightly different legacy syntax "
        "(`claude mcp add --transport http github ... -H \"Authorization: "
        "Bearer ...\"`) for versions before Claude Code 2.1.1 — use the "
        "`add-json` form above unless you're on an older Claude Code "
        "version."
    ),
)
