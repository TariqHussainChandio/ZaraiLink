# MCP servers

The live configuration is `.mcp.json` in the repository root (git-ignored; copy `.mcp.json.example`), and the
permission rules are in `.claude/settings.json`. Setup, sign-in and the access rules for the hosted Supabase project:
[`docs/setup/DEVELOPMENT_SETUP.md`](../../setup/DEVELOPMENT_SETUP.md), section "MCP servers".

Servers considered and not added yet:

| Server | Status |
|---|---|
| GitHub (official, `https://api.githubcopilot.com/mcp`) | Not added: needs a personal access token only the maintainer can create, and the `gh` CLI already covers pull requests, runs and secrets |
| Android device control | Not added: there is no official server, only community projects whose source would need review first; `adb` from the shell is used instead |
