# ai (app)

The disease advisory screens: photo upload, processing and the result. The result is advice only and points the user to an expert (BR-13).

- **Owner lane:** `zl-ai` (docs/plan.md §3)
- **SRDS:** §32–§37, §40
- **API side:** [`backend/app/ai`](../../backend/app/ai/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `DiseasePrefill`. The scan hands off to an expert through `prefill.diseaseCaseId` and never writes the AI's text into the farmer's problem (FA-09).

The scan offers only the crops the model knows (D16, `GET /api/v1/disease/crops`); a photo the model reads as another crop gets the advisory and the expert action, not a report.

## Inside

`hooks/` · `screens/` (3) · `services/` · `types/`. Tests sit beside the code they test.
