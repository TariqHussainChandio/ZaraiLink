# Integration Brief: Sentry error tracking (gate G5)

Status: **waiting for the maintainer.** The FastAPI side is built and proven up to the provider seam
(phase P5, 5E): with no `SENTRY_DSN` nothing is initialised, and with one set the backend reports unhandled
errors with personal data removed. The React Native side is not built; it belongs to P7 and needs its own DSN.

```
Service and purpose:           Error tracking for the FastAPI backend (and later the React Native app), so
                               a crash or 500 in production is seen with its stack trace and request id
                               instead of only in a log nobody is reading.

Options considered:
  1. Sentry (SaaS)               Free developer plan, about 5k errors a month, no card. Official SDKs for
                                 FastAPI and React Native (with source maps). The plan's chosen provider.
  2. Self-hosted GlitchTip       Sentry-compatible and free, but needs a server to run and patch. More
                                 work than this project's scale justifies.
  3. Do nothing                  Production errors stay invisible until a user reports them.

Recommendation and why:        Option 1. Zero infrastructure, and the same account later serves the app
                               (P7). The 5k-error quota is enough for a student-scale launch; an error
                               storm is capped by the plan and the SDK's own sampling.

What YOU (the maintainer) must do:
                               1. Create a Sentry account and an organization.
                               2. Create two projects: "zarailink-api" (platform FastAPI/Python) and, when P7
                                  starts, "zarailink-app" (React Native). Copy each project's DSN.
                               3. Store the API DSN as the `SENTRY_DSN` environment variable of the hosted
                                  backend (a GitHub Environment secret or the host's secret store) and in
                                  your local backend/.env to test. Never in chat, code or git.
                               4. For source maps later (P7 only): create an auth token and store it as a
                                  GitHub secret. Not needed for the backend.
                               5. Tell me it is ready; I run the live smoke test below.

Secret and variable names:     SENTRY_DSN (backend). A DSN is a write-only identifier, but each deployment
                               still gets its own so environments do not mix. Later: SENTRY_AUTH_TOKEN
                               (source-map upload, CI only).

Where it is used in code:      backend/app/core/observability.py (init and scrubbing), called from the
                               lifespan in backend/app/main.py; request-id tag in core/middleware.py;
                               capture in core/problem_details.py:unhandled_exception_handler.

How I prove it without the real service:
                               backend/tests/unit/test_observability.py swaps in an in-memory transport and
                               drives a real request that raises: the event is captured, carries the request
                               id, and contains no bearer token or request body. Off by default: no DSN
                               means no client is created, so tests, CI and local runs never call out.

How I prove it live:           With SENTRY_DSN set, trigger one real unhandled error against the running API
                               and show the event in the Sentry project with its request_id tag, then
                               confirm the event's request data shows no Authorization value, body or
                               query string. Output and a screenshot go to the phase record.

If the service is down:        The SDK sends in a background thread and drops events on failure; requests
                               are never delayed or failed by Sentry being unreachable.

Privacy and cost:              Events carry the route, method, status, stack trace (no local variables),
                               request id and opaque user id only. Request bodies, cookies, query strings,
                               credential headers, email and IP are removed before sending (send_default_pii
                               is off and a before_send hook enforces it). $0 on the free plan.
```

## After this is done

- Flip the feature register's "Backend error tracking (Sentry)" row from `Blocked` to `Works` once the live
  smoke test passes.
- P7 adds the React Native SDK, source maps, and reads the request id from API error responses into
  breadcrumbs.
