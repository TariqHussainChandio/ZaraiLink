"""Supabase MCP — P0.

Official, hosted server. Verified against https://supabase.com/docs/guides/ai-tools/mcp.
"""

from __future__ import annotations

from .base import McpServerConfig, RequiredSecret

# The linked ZaraiLink Supabase project ref, confirmed via supabase/config.toml
# and .temp/linked-project.json during the earlier repo audit — never omit it
# from the command below, or the server gets access to every project on the
# account, not just this one.
PROJECT_REF = "uqcxwshlxvmoovjpizlf"

CONFIG = McpServerConfig(
    name="supabase",
    priority="P0",
    why_needed=(
        "Direct, live inspection of the linked ZaraiLink Supabase project — "
        "schema, tables, RLS policies, functions — without leaving Claude "
        "Code. See the ZaraiLink Field Manual's MCP Servers section for the "
        "full comparison against a generic Postgres MCP."
    ),
    transport="http",
    claude_mcp_add_command=(
        "claude mcp add --scope project --transport http supabase "
        f'"https://mcp.supabase.com/mcp?project_ref={PROJECT_REF}&read_only=true"'
    ),
    required_secrets=(
        RequiredSecret(
            env_var="(none — OAuth)",
            description=(
                "The hosted Supabase MCP server authenticates via OAuth, not "
                "an environment variable. After adding it, run `claude /mcp`, "
                "select `supabase`, and choose Authenticate."
            ),
            how_to_obtain=(
                "Sign in with the Supabase account that owns the ZaraiLink "
                "project when the OAuth flow opens in your browser."
            ),
        ),
    ),
    scoping_notes=(
        "`read_only=true` is deliberate and should stay on: it executes "
        "every query as a read-only Postgres role and disables "
        "apply_migration/create_project/branch-management tools. This "
        "matches the project's standing rule — every migration is validated "
        "against local Docker Postgres first, and pushed only with explicit "
        "sign-off — never through an MCP tool call. Only drop --read-only "
        "for a specific, deliberate session where you've decided in advance "
        "you want write access, and turn it back on afterward."
    ),
    source_docs=("https://supabase.com/docs/guides/ai-tools/mcp",),
    caveats=(
        "For CI or non-interactive use (not this project's current setup), "
        "the docs also show an access-token variant using an "
        "`Authorization: Bearer $SUPABASE_ACCESS_TOKEN` header instead of "
        "OAuth — not included here since interactive OAuth is the right fit "
        "for a solo dev session."
    ),
)
