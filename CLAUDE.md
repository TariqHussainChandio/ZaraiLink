@AGENTS.md

# Claude Code specifics

The shared rules above apply in full. Additions for Claude Code sessions:

## Project skills

The specialist skills in `.claude/skills/` map onto the work types in the plan. Use the implementer skill for the
work and a different agent using a verifier skill to sign it off (rule 5).

| Work | Implementer | Verifier |
|---|---|---|
| Screens, state, navigation | `senior-react-native-architect` | `qa-test-engineer`, `code-reviewer` |
| UX, accessibility | `ui-ux-designer` | `srds-requirements-validator`, `academic-supervisor-reviewer` |
| API endpoints and services | `fastapi-backend-engineer` | `integration-engineer`, `security-engineer` |
| Migrations, RLS, storage | `postgresql-database-engineer` | `security-engineer` |
| Disease model | `ai-ml-engineer` | `qa-test-engineer` |
| CI/CD, hosting, releases | `devops-engineer` | `security-engineer` |
| Docs, ADRs, runbooks | `technical-documentation-writer` | `academic-supervisor-reviewer` |
| Orchestration and phase gates | `zarailink-master-orchestrator` | `senior-software-project-manager` |

## Working style

- Prefer the dedicated file tools over shell equivalents; use the Context7 and Supabase MCP servers for current
  library docs and schema inspection.
- Plan mode for anything touching auth, RLS, payments, or migrations; the plan is approved before code changes.
- Keep the plan of record current: after a phase or a decision, update `docs/plan.md` (built from `docs/srds.md`)
  and the published Field Manual artifact.
- Run long scans (Semgrep, a full `supabase start`) in the background and keep working.
