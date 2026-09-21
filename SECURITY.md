# Security policy

## Reporting a vulnerability

Please report security problems privately. Do not open a public issue, pull request, or discussion, and do not
post details anywhere public until a fix is available.

- **Preferred:** use GitHub's private vulnerability reporting: open the repository's **Security** tab, choose
  **Report a vulnerability**, and describe the problem. (This is available once the repository is public and the
  maintainer has enabled it; until then, contact the maintainer directly through GitHub.)
- Include what you found, the steps to reproduce it, and the impact you expect. A proof of concept against a
  local stack is ideal.

You should get an acknowledgement within a few days. This is a student project maintained by one person, so
please allow reasonable time for a fix.

## Scope

In scope: the mobile app, the FastAPI backend, the Supabase schema, policies, and functions in `supabase/`, and
the CI configuration in `.github/`.

Out of scope: vulnerabilities in third-party services themselves (Supabase, GitHub, Google Play), social
engineering, and denial-of-service by volume.

## Testing rules

Test only against a local stack you run yourself (`npx supabase start`). Do not test against any deployed
environment, do not access data that is not yours, and do not create accounts or data in a real project.

## What to expect

Confirmed problems are fixed, tracked in [`docs/status/`](docs/status/), and credited to the reporter unless
they prefer otherwise. Known, tracked weaknesses are listed there with their planned fix.

## Supported versions

The project has no stable release yet. Only the `main` branch is supported.
