# P2 evidence: Expo migration

What was run to prove phase P2, and the output it produced. The report that reads this is
[`../../p2-expo-2026-09.md`](../../p2-expo-2026-09.md).

Everything ran on **one Android emulator (Pixel 8 image, Android 16, API 36) against a local Supabase stack and a
local API**. Nothing touched the hosted Supabase project. The users are created in the disposable local
database and vanish with `npx supabase stop`.

| File | What it does |
|---|---|
| `create_local_users.py` | Creates one confirmed user per role through the local auth admin API. Refuses any host that is not localhost |
| `ui.py` | Drives the emulator with `adb` and `uiautomator`: dump the screen, tap by label, type, screenshot |
| `appstate.py` | Clears the app, opens the development build, and waits until the sign-in screen is usable |
| `login_flow.py` | Signs in as each role through the real screen and records what the app shows |
| `link_flow.py` | The real password-reset flow: request it in the app, read the email from the local mail catcher, open its link while the app is running, and report whether the app moved to the new-password screen |
| `manifest_summary.py` | Parses merged `AndroidManifest.xml` files and prints permissions, attributes, exported components, and link schemes |
| `results/manifest-comparison.txt` | Output of `manifest_summary.py` for the old and new builds |
| `results/apk-sizes.txt` | Size of the old and new release builds, by part |
| `results/runtime-observations.md` | Raw output for claims that have no screenshot: New Architecture, the cold-start link, R8 class names, the storage row |
| `results/screenshots/` | Eleven screenshots that back the claims in the report |

## How to repeat it

```bash
npx supabase start -x studio,edge-runtime,logflare,vector,imgproxy,supavisor
# start the API against the local stack (docs/setup/DEVELOPMENT_SETUP.md, step 3) and Metro (`npm start`)
export LOCAL_SUPABASE_URL=http://127.0.0.1:54321
export LOCAL_SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from `npx supabase status -o env`>
python docs/status/evidence/p2/create_local_users.py
python docs/status/evidence/p2/login_flow.py <output-dir> farmer,buyer,dealer,expert,admin
python docs/status/evidence/p2/link_flow.py <output-dir> run1
```

The scripts assume the development build is installed on the running emulator and Metro is reachable at
`10.0.2.2:8081`. They are scratch tooling for this phase, not a test suite: the Maestro end-to-end suite in
phase P11 replaces them.

## Method notes that matter

- **A made-up reset code proves nothing.** With no stored PKCE verifier, supabase-js rejects it locally, so the
  app shows nothing and the server sees nothing, whether or not the link reached JavaScript. `link_flow.py` uses
  a real emailed link for that reason.
- **JavaScript `console` output does not reach `adb logcat`** in this React Native version, in debug or release.
  Claims are proven by what the screen shows, by the local gateway log, or by native log lines.
- **The minified release build cannot reach the local server**, because release refuses plain HTTP. Its photo and
  upload checks used a test-only variant built from the same tree with `usesCleartextTraffic` switched on. That
  variant is never committed.
- **Build sizes come from x86_64-only builds** made in a short path (`D:\zl-before`, `D:\zl-ci`), because React
  Native's C++ build fails past 260 characters on Windows. "Before" is a `git archive` of the tag `pre-expo-cng`.
  "Final" is a fresh copy of the working tree with `npm ci`, so it is what a clean checkout produces.
