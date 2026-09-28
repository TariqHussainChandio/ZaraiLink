# common/auth (app)

Sign-in, registration, the email code step, password reset, the splash and suspended screens, and the second-factor (TOTP) hooks. Sessions come from Supabase Auth.

- **Owner lane:** `zl-accounts` (docs/plan.md §3)
- **SRDS:** §4–§7, §10, §13
- **API side:** [`backend/app/common/auth`](../../../backend/app/common/auth/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `useEnrollTotp`, `useUnenrollTotp`, `useVerifiedTotpFactor`, `useVerifyTotpEnrollment`, `TotpEnrollment`, `mapMfaErrorMessage`, `mapPasswordFlowErrorMessage`.

## Inside

`hooks/` · `screens/` (7) · `services/`. Tests sit beside the code they test.
