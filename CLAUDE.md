@AGENTS.md

# Claude Code specifics

The shared rules above apply in full. Additions for Claude Code sessions:

## Lane agents (parallel work)

Each phase of the plan (`docs/plan.md`, `docs/plan-ecommerce.md`, `docs/plan-inventory.md`) is split into lanes,
and each lane has an agent in `.claude/agents/` that owns specific folders. Run the lanes of one phase in parallel
with the Agent tool (`subagent_type` = the lane name, `isolation: "worktree"`), then merge at the checkpoint in
order: `zl-db` → API lanes → `zl-backend-core` (contract regeneration) → app lanes → `zl-verifier`.

| Agent | Owns |
|---|---|
| `zl-orchestrator` | task cards, merge order, `docs/plan*.md`, feature register |
| `zl-db` | `supabase/migrations`, `supabase/tests`, `supabase/seed.sql`, `docs/database` (the only migration writer) |
| `zl-backend-core` | backend auth, database, storage, middleware, config, common core, `main.py`, OpenAPI and generated client, `scripts/` gates |
| `zl-app-core` | frontend theme, navigation, services, state, hooks, utils, config, common components |
| `zl-accounts` · `zl-commerce` · `zl-comms` | the shared features in `common/`: accounts and profile · marketplace, orders, payments, reviews · messaging, notifications |
| `zl-farmer` · `zl-buyer` · `zl-dealer` · `zl-expert` · `zl-admin` · `zl-ai` | their role or AI module, frontend and backend |
| `zl-inventory-api` · `zl-inventory-app` | the dealer Inventory Management System, backend and app |
| `zl-devops` | CI, build configuration, releases |
| `zl-verifier` | nothing: independent, fresh-context sign-off |

## Project skills

The skills in `.claude/skills/` give agents domain know-how. Use the implementer skill for the work and a different
agent with a verifier skill to sign it off (rule 5).

| Work | Implementer | Verifier |
|---|---|---|
| Screens, state, navigation | `senior-react-native-architect` | `qa-test-engineer`, `code-reviewer` |
| UX, accessibility | `ui-ux-designer` | `srds-requirements-validator`, `academic-supervisor-reviewer` |
| API endpoints and services | `fastapi-backend-engineer` | `integration-engineer`, `security-engineer` |
| Migrations, RLS, storage | `postgresql-database-engineer` | `security-engineer` |
| Dealer inventory system | `inventory-systems-engineer` | `qa-test-engineer`, `security-engineer` |
| Disease model and AI report | `ai-ml-engineer` | `qa-test-engineer` |
| CI/CD, hosting, releases | `devops-engineer` | `security-engineer` |
| Architecture decisions | `solution-architect` | `srds-requirements-validator` |
| Docs, ADRs, runbooks | `technical-documentation-writer` | `academic-supervisor-reviewer` |
| Orchestration and phase gates | `zarailink-master-orchestrator` | `senior-software-project-manager` |

## MCP servers

`.mcp.json` (git-ignored; copy `.mcp.json.example`): `context7` for current library docs, `supabase` for the hosted
project (read-only), `supabase-local` for the local Docker stack. Prefer `supabase-local` for anything you might
write or test; the hosted project is read-only through MCP and changes there go through reviewed migrations.

## Working style

- Prefer the dedicated file tools over shell equivalents.
- Plan mode for anything touching auth, RLS, payments, or migrations; the plan is approved before code changes.
- Keep the plan of record current: after a phase or a decision, update `docs/plan.md` (and the phase plan) and the
  published Field Manual artifact.
- Run long jobs (Semgrep, a full `supabase start`, the Android build) in the background and keep working.
