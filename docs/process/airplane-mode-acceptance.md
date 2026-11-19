# Airplane-mode acceptance script (P7 exit)

Status: **written, not yet run.** It needs an Android emulator or device with the app installed and signed in, and
the local stack running (`docs/setup/DEVELOPMENT_SETUP.md`). Record the result in the feature register row
"Offline behaviour" only after a run; until then that row stays "Built, not proven on a device".

Use a debug or release build of the current branch, a farmer or buyer account that has at least one marketplace
listing, and one order. Toggle the connection with adb (Android 11 and newer):

```
adb shell cmd connectivity airplane-mode enable
adb shell cmd connectivity airplane-mode disable
```

Under Git Bash on Windows, `adb shell` can print only a banner and exit 0 without running anything. Read the
screen, not the exit code (see AGENTS.md, "Learned the hard way").

## Steps and what must happen

| # | Do | Expected |
|---|---|---|
| 1 | Online: open Browse, open one listing, open Orders | Data loads; no banner |
| 2 | Enable airplane mode | The "No internet connection" banner appears within a few seconds, without any request having to fail first |
| 3 | Go back to Browse and pull to refresh | Browse still shows the listings from step 1; nothing turns into an error screen |
| 4 | Open the listing from step 1 again | It shows the cached listing |
| 5 | Open a screen never visited (for example Notifications) | A clear "no connection" message with Retry, not a blank screen or a raw error |
| 6 | Try a write (send a chat message, or place an order) | It fails with a clear message and nothing is queued behind the user's back; the user is **not signed out** |
| 7 | Force-stop the app while offline and start it again | The app opens signed in (session kept); Browse shows the cached listings |
| 8 | Disable airplane mode | The banner disappears without a tap; visible screens refetch on their own |
| 9 | Repeat the write from step 6 | It succeeds |
| 10 | Take a photo for a listing and inspect the uploaded file (storage bucket, local stack) | JPEG, longest side at most 1600 px, no GPS tags in its EXIF (`exiftool` on the downloaded file) |

## Inventory system (B6)

The dealer's inventory system follows its own offline rule (maintainer, 2026-10-11): reads come from the copy kept on
the phone for 24 hours, and a write fails at once and says so, with nothing queued (`frontend/inventory/hooks/mutation.ts`).
Inventory data is persisted with the public marketplace reads and nothing else personal (`frontend/hooks/queryClient.ts`);
the whole persisted cache is wiped on sign-out and when another user's session starts. An offline cold start opens the
shell from the role and approval remembered for that same user (`frontend/state/rememberedProfile.ts`, `authStore.ts`).

Needs two approved dealers, A and B, made on the local stack the way the smoke tests make them
(`backend/tests/integration/smoke/conftest.py`, `inventory_world.py`). Dealer A has at least two products, stock at one
location, a few movements (a stock in, a local sale) and a purchase. Dealer B has no inventory. Sign in as dealer A.

The lost-reply step slows the emulator's network so a write reaches the API but its answer arrives after the app's
15-second timeout (`frontend/services/api/client.ts`). The emulator console sets the delay; it needs no root:

```
adb emu network delay 9000
adb emu network delay none
```

| # | Do | Expected |
|---|---|---|
| I1 | Online: on the dealer dashboard, tap "Open Inventory System" | The inventory system opens on its Dashboard with the totals (Products, Stock units, Low stock, Out of stock, Stock value at cost); no banner |
| I2 | Online: open the Products tab, one product, the Stock tab, Reports (the stock summary), and More → Activity history | Each loads; these are the reads the phone keeps |
| I3 | Enable airplane mode | "You are offline" appears above the app bar within a few seconds; the app bar, the alert button and "Back to ZaraiLink" stay visible and tappable below it |
| I4 | Open Dashboard, Products, the product from I2, Stock, Reports and Activity history again | Each shows what it showed in I2 under the banner; none shows "Couldn't load…" or a second error banner |
| I5 | Open a product's Stock out, enter a quantity and tap "Save stock out" | "You're offline — this change wasn't saved." The form stays open with what was typed; Activity history gains nothing after reconnecting |
| I6 | On Reports, tap "Export CSV" | "You're offline. Connect to the internet to export this report." No browser opens |
| I7 | Force-stop the app while still offline, then start it | The app opens signed in, in the dealer shell (not the buyer shell, not "We can't check your account"); the banner shows |
| I8 | Tap "Open Inventory System" | The inventory system opens; Dashboard, Products and Reports show the copy from I2 |
| I9 | Disable airplane mode | The banner clears without a tap; the visible screen refetches; the shell stays the dealer's (it follows the server's profile, read again on reconnect) |
| I10 | Online: while the app is open, have an admin suspend dealer A, then toggle airplane mode on and off | After the reconnect the app leaves the inventory system and shows the suspended screen; lift the suspension afterwards |
| I11 | Run `adb emu network delay 9000`, open Stock in for a product, enter 1 and tap Save | After about 15 seconds the banner reads "Not confirmed: We couldn't confirm this was saved. Check Activity history before entering it again."; the form keeps what was typed |
| I12 | Run `adb emu network delay none`, then tap Save again on the same form | It saves and closes; Activity history shows **one** stock in of 1, never two (the form resent the same Idempotency-Key, so the API returned the first record) |
| I13 | Leave the inventory system, sign out, then enable airplane mode and start the app | The sign-in screen; nothing of dealer A is on the phone to show |
| I14 | Disable airplane mode, sign in as dealer B, enable airplane mode, open Inventory | Dealer B's own empty inventory (or "can't load" for screens dealer B never opened); none of dealer A's products, figures or history |
| I15 | Sign out of B, sign in as a buyer or farmer | No "Open Inventory System" tile; nothing of either dealer's stock anywhere |

**Known limit (B4 re-verification).** An offline cold start after the access token has expired (an hour on the local
stack, `jwt_expiry` in `supabase/config.toml`) cannot refresh the session, so the app opens on the sign-in screen and
the persisted cache is wiped with the session. To observe it: sign in as dealer A online, open Inventory, force-stop the
app, wait out the token lifetime (or shorten `jwt_expiry` on the local stack and restart it), enable airplane mode and
start the app. Expected: the sign-in screen; after signing in online, the inventory loads from the server again.

## Also to observe on the device (7E and 7F)

- A screen that throws while rendering shows the retry screen for that navigator, and Retry recovers (temporarily
  throw in a screen's render to prove it, then revert).
- Chat and consultation lists open at the newest message and follow new ones when scrolled to the bottom (FlashList
  has no `inverted`; both lists use `maintainVisibleContentPosition`).
- Browse's two-column grid, the admin lists and the inventory list scroll smoothly with 100+ rows.
- The release build (R8) behaves the same as debug.
