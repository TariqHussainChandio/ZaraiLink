"""Context7 MCP — P0.

Official (Upstash), hosted server. Verified against
https://github.com/upstash/context7.
"""

from __future__ import annotations

from .base import McpServerConfig, RequiredSecret

CONFIG = McpServerConfig(
    name="context7",
    priority="P0",
    why_needed=(
        "Up-to-date, version-specific docs and code examples for React "
        "Native, Supabase, FastAPI, React Navigation, and the rest of the "
        "stack, pulled directly into context — instead of relying on "
        "training-data knowledge that drifts as a fast-moving ecosystem "
        "ships new APIs."
    ),
    transport="http",
    claude_mcp_add_command=(
        'claude mcp add --transport http context7 "https://mcp.context7.com/mcp"'
    ),
    required_secrets=(
        RequiredSecret(
            env_var="CONTEXT7_API_KEY",
            description=(
                "Optional. Context7 works with no key at a lower rate "
                "limit; a free key raises it. Not required to get started."
            ),
            how_to_obtain="https://context7.com/dashboard",
        ),
    ),
    scoping_notes=(
        "No project-specific scoping needed — this server only serves "
        "public library documentation, nothing ZaraiLink-specific ever "
        "passes through it."
    ),
    source_docs=(
        "https://github.com/upstash/context7",
        "https://context7.com/docs/resources/all-clients",
    ),
    caveats=(
        "The exact header syntax for attaching CONTEXT7_API_KEY (an "
        "`Authorization: Bearer <key>` header on the same URL) was found in "
        "search results but not confirmed verbatim from the full docs page "
        "in this session — check "
        "https://context7.com/docs/resources/all-clients for the current "
        "Claude Code-specific JSON block before relying on the higher rate "
        "limit. The no-key command above is confirmed."
    ),
)
