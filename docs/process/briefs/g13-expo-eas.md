# Integration Brief: Expo account and EAS (gate G13)

Status: **waiting for the maintainer.** Nothing in phases P2 to P11 depends on the answer. It is needed
when release builds and over-the-air updates start (phase P12).

```
Service and purpose:           Expo Application Services (EAS). Three parts:
                               - EAS Build: signed release builds in Expo's cloud
                               - EAS Update: over-the-air JavaScript updates (staging and production channels)
                               - Credentials: stores the Android upload keystore
                               Serves the release pipeline in phase P12. No business rule depends on it.

Options considered:
  1. Expo free plan             Cost 0. About 15 Android builds a month in a slow shared queue; over-the-air
                               updates free up to about 1,000 monthly users (limits as of the plan, Sept 2026;
                               check the pricing page before relying on them). Available in Pakistan.
  2. No EAS                     Build in GitHub Actions with Gradle (already done for every pull request) and
                               upload to Google Play by hand. Cost 0. No over-the-air updates: every fix
                               needs a store release. Keystore lives in a GitHub Environment secret.
  3. Paid Expo plan             Faster builds, more updates. Not needed for a final-year project.

Recommendation and why:        Option 1, kept as the release path only. Pull-request and main builds
                               already run on GitHub runners, so the free build quota is spent only on signed
                               releases. If the quota runs out, option 2 is a working fallback with no
                               change to the app. Over-the-air updates are the reason to pick EAS at all: a
                               fix to a farmer-facing screen reaches users without waiting for a store review.

What YOU (the maintainer) must do:
                               1. Create an Expo account at expo.dev with an email you control.
                               2. Run `npx eas-cli login` and `npx eas-cli init` in the repository. It adds the
                                  project ID to the Expo config. Commit that change.
                               3. Create an access token (Account settings, Access tokens) and store it as the
                                  GitHub secret `EXPO_TOKEN`, in a GitHub Environment (not a repository secret).
                               4. Tell me the account is ready. I then write eas.json and the release workflow.

Secret and variable names:     EXPO_TOKEN (GitHub Environment: staging, production). The project ID is public
                               and lives in the Expo config. Per-profile public values (EXPO_PUBLIC_*) go in
                               eas.json, never a secret.

Where it is used in code:      eas.json (new), app.config.ts (project ID, update channel, runtime version
                               policy), .github/workflows (release job). Nothing in frontend/.

How I prove it without the real service:
                               Already proven. `npm run prebuild` plus `./gradlew assembleRelease` builds the
                               same app locally and in CI with no Expo account. That output is what EAS builds.

How I prove it live:           `eas build --profile preview --platform android` finishes; the APK installs on a
                               real device, reaches the sign-in screen, and signs in against staging. Then a
                               one-line JavaScript change published to the staging channel appears on that
                               device after a restart. Output of both is attached to the release notes.

If the service is down:        Builds fall back to option 2 (GitHub Actions and Gradle). An update that
                               cannot be fetched leaves the app on its current version. It never blocks start.

Privacy and cost:              EAS Build uploads the project source (files Git tracks) to Expo's servers.
                               Once the repository is public this is not a new exposure. The upload key is held
                               in Expo's credential vault. No user data is sent. Over-the-air updates ship
                               only the JavaScript bundle and assets. Cost 0 on the free plan.
```
