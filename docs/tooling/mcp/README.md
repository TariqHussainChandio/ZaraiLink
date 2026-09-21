# MCP server configurations — reference only

This folder is a reviewable record of the MCP servers ZaraiLink actually needs, researched and
source-verified against each vendor's own docs. **It is not live configuration** — Claude Code
reads `.mcp.json` (or its own `claude mcp add` CLI state), not these Python files. Nothing here
runs automatically, and nothing here has been applied yet.

Full rationale — including the servers deliberately *not* included here (Filesystem, Postgres,
Sentry, Docker, Playwright) and why — lives in the **MCP Servers** section of the published
ZaraiLink Field Manual artifact.

## Files

| File | Server | Priority | Status |
|---|---|---|---|
| `supabase_mcp.py` | Supabase (official, hosted) | P0 | **Registered in `.mcp.json`** — needs OAuth sign-in (`/mcp` in an interactive session) before it's usable |
| `context7_mcp.py` | Context7 (official, Upstash, hosted) | P0 | **Registered in `.mcp.json`** — needs a one-time approval prompt in a fresh interactive session |
| `github_mcp.py` | GitHub (official, hosted or Docker) | P1 | Not yet applied — needs a PAT only you can create |
| `android_adb_mcp.py` | Android/ADB device control | P1 | Not yet applied — **no official server** — candidates only, pick one and read its source first |

Each file (except `android_adb_mcp.py`) exports a `CONFIG: McpServerConfig` with the exact
`claude mcp add` command, what credential it needs and where to get it, scoping guidance, source
docs it was checked against, and any caveat worth double-checking before relying on it.

## How to actually apply one

1. Read the file for the server you want.
2. Generate whatever credential `required_secrets` names (a Supabase OAuth sign-in, a GitHub PAT,
   etc.) — this is the one step only you can do.
3. Run the `claude_mcp_add_command` yourself, in a terminal, outside of an active Claude Code
   session that's mid-conversation.
4. Confirm it connected: `claude mcp list` or `/mcp` inside a session.

Claude Code should not run these commands on your behalf without you explicitly asking in that
moment — adding an MCP server is a config change with real credential and access implications,
not something to do as a side effect of a broader task.

## Why Python, not JSON

These are meant to be read and reasoned about, not machine-applied — a typed `dataclass` with a
docstring per field carries the *why* (scoping rationale, caveats, where a credential comes from)
in a way a bare `.mcp.json` block can't. If you want the literal `.mcp.json` shape, the
`claude_mcp_add_command` on each `CONFIG` is exactly the command that would produce it.
