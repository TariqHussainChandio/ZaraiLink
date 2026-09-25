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

## Also to observe on the device (7E and 7F)

- A screen that throws while rendering shows the retry screen for that navigator, and Retry recovers (temporarily
  throw in a screen's render to prove it, then revert).
- Chat and consultation lists open at the newest message and follow new ones when scrolled to the bottom (FlashList
  has no `inverted`; both lists use `maintainVisibleContentPosition`).
- Browse's two-column grid, the admin lists and the inventory list scroll smoothly with 100+ rows.
- The release build (R8) behaves the same as debug.
