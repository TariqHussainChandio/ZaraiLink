# expert (app)

The expert's own workspace: dashboard, application and expert analytics, plus the expert hooks and services that other modules use (the directory, the admin verification queue). Consultations are in `common/consultations`.

- **Owner lane:** `zl-expert` (docs/plan.md §3)
- **SRDS:** §10–§11, §35–§36
- **API side:** [`backend/app/expert`](../../backend/app/expert/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `useExpertProfile`, `useExperts`, `fetchExpertById`, `fetchExpertForAdminById`, `fetchExpertsForAdmin`, `resolveExpertDocumentUrl`, `reviewExpertVerification`, `Consultation`, `ConsultationMessage`, `ConsultationMessageWithListing`, `ConsultationPriority`, `ConsultationStatus`, `ConsultationWithRelations`, `ExpertSpecialization`, `ExpertWithProfile`, `VerificationStatus`.

## Inside

`hooks/` · `screens/` (3) · `services/` · `types/`. Tests sit beside the code they test.

The consultation types still live in `types/expert.ts`, where A1 moved them unchanged.
