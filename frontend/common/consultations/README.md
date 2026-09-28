# common/consultations (app)

The expert directory and profiles, consultation requests, and the consultation list and thread.

- **Owner lane:** `zl-expert` (docs/plan.md §3)
- **SRDS:** §34–§35
- **API side:** [`backend/app/common/consultations`](../../../backend/app/common/consultations/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `ConsultationCard`, `useConsultations`.

## Inside

`components/` · `hooks/` · `screens/` (5) · `services/`. Tests sit beside the code they test.
