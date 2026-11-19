# Accessibility acceptance script (A8)

Status: **written, not yet run.** It runs in the testing stage, on an Android emulator or device with the app
installed, the local stack running (`docs/setup/DEVELOPMENT_SETUP.md`) and one approved account per role. Record the
result in the feature register only after a run. Use the release build as well as debug once (R8, AGENTS.md).

Each role is walked three times, in this order:

| Pass | Set on the phone | What it proves |
|---|---|---|
| **T** TalkBack | Settings → Accessibility → TalkBack on. Swipe right to move, double-tap to activate | Every control is reachable, named and has a role; changes are announced |
| **F** Font 130% | Settings → Display → Font size to 130% (or `adb shell settings put system font_scale 1.3`) | No text is cut off, overlaps or hides a control; nothing needs a horizontal scroll that did not before |
| **D** Dark mode | App Settings → Appearance → Dark (and once on "System" with the phone dark) | Every screen, badge, chart and toast reads in dark; no white flash, no invisible icon |

Read the screen, not an exit code: `adb shell` under Git Bash can print a banner and run nothing (AGENTS.md).

## Checks that apply on every screen

Fail the step if any of these fails; note the screen.

1. **Names.** TalkBack reads every button, tab, chip and icon button with a plain name ("Dismiss message", "Back",
   "Notifications, 3 unread"), never "Button", "Unlabelled" or a file name.
2. **Roles.** Buttons say "button", tabs say "tab, 2 of 4", headings say "heading", switches say "switch, on/off".
3. **One stop per item.** A list row, stat tile, chart or banner is read as one stop ("Stock units: 3,482 units"),
   not as three fragments.
4. **48dp.** Every target is at least 48 × 48dp: turn on Developer options → "Show layout bounds" and check the
   small ones (icon buttons, chips, the toast's X, steppers, the sheet's close). A chip or small button may draw
   smaller only if its hit area (hitSlop) reaches 48dp.
5. **Announcements.** A save shows a toast that TalkBack reads without moving focus (for example "Product saved");
   a failed save reads its danger banner as an alert. The toast stays about 4 s and its X closes it.
6. **States.** Loading shows a skeleton (no pulse when Settings → Accessibility → Remove animations is on); a failed
   load shows "Couldn't load …" with a Retry that works; an empty list says what is missing and the next step.
7. **Reduced motion.** With "Remove animations" on, the toast appears without sliding and skeletons do not pulse.

## Farmer

| # | Flow | Steps | Must be announced / checked |
|---|---|---|---|
| F1 | Dashboard | Sign in, land on Home | Greeting heading; each stat tile as "label: value"; quick actions as buttons |
| F2 | Sell: new listing | Listings → Add listing → fill title, price, quantity, photo → Publish | Each field's label and error; photo picker button named; success toast read |
| F3 | Orders received | Orders → open one → move it on | Status read as text, not colour only; the order timeline read step by step |
| F4 | Buy from a dealer | Browse → listing → Buy → checkout | Price breakdown reads the delivery charge as its own line (BR-09) |
| F5 | AI disease check | AI → take or pick photo → result | Result read with "advisory" wording (BR-13); "Talk to an expert" button reachable |
| F6 | Messages | Open a chat, send a message | New message announced; composer labelled; send button named |

## Buyer

| # | Flow | Steps | Must be announced / checked |
|---|---|---|---|
| B1 | Browse | Browse → search → filter chips | Search field labelled; chips say selected / not selected |
| B2 | Listing detail | Open a listing | Photo has a description; price read with "Rs"; seller name and rating read |
| B3 | Checkout | Buy → address / location → place order | Location picker usable without sight; delivery charge its own line; success toast |
| B4 | Orders and review | Orders → completed order → Review | Star rating control says "3 of 5 stars"; submit toast |
| B5 | Notifications | Bell → list | Bell reads unread count; each notification one stop |

## Dealer (marketplace and Inventory System)

| # | Flow | Steps | Must be announced / checked |
|---|---|---|---|
| D1 | Dashboard | Sign in as an approved dealer | Stat tiles, bar chart read as one summary ("7 bars. Highest: …"), activity rows as buttons |
| D2 | Order dispatch | Orders → open a paid order → Dispatch | Confirmation read; success toast; stock change visible afterwards |
| D3 | Open Inventory System | Home → Inventory System | Its own header and tabs announced; Exit returns to the marketplace shell |
| D4 | Products | Products → search → Add product → save | Search labelled; stock status badge read as text; save toast |
| D5 | Stock operations | Stock → Stock in / Stock out / Adjust / Transfer | Quantity stepper buttons named ("Increase", "Decrease") and 48dp; result announced |
| D6 | Locations | Stock → location switcher → change | Current location read; the default-location switch reads its state |
| D7 | Alerts | Alerts → Alert settings → change threshold → save | Out-of-stock and low-stock rows read their status; save toast |
| D8 | Purchases | Purchases → new → add item → save → Receive into stock | Each step announced; the receive confirmation read |
| D9 | Movements and reports | Movements → filter chips; Reports → reconciliation | Filters say selected; each movement one stop with source and quantity |
| D10 | Sync log | More → Marketplace sync → Retry failed | Failed rows read as failed; retry result announced |

## Expert

| # | Flow | Steps | Must be announced / checked |
|---|---|---|---|
| E1 | Queue | Sign in → Consultations | Each request one stop with crop, farmer and age |
| E2 | Consultation | Open one → read AI result and photos | AI result read as advisory; photos described |
| E3 | Professional assessment | Write assessment → submit | Fields labelled; submit toast; the farmer's side shows the assessment |
| E4 | Messages | Reply in the consultation chat | As F6 |

## Admin

| # | Flow | Steps | Must be announced / checked |
|---|---|---|---|
| A1 | Dashboard | Sign in → Dashboard | Stat tiles and charts as single summaries |
| A2 | Applications | Dealer and expert applications → open → view document → approve / reject with reason | Document tiles' View and Remove buttons named with the file; decision toast |
| A3 | Moderation | Moderation → hide a listing with a reason | Reason field labelled; the action's toast; item status read |
| A4 | Audit log | Audit log → filter | Each entry one stop: who, what, when (BR-15) |
| A5 | Reports | Reports → change period | Period chips say selected; charts announce their summary |

## Results

Fill in one row per role and pass. Write the screen and what failed in "Notes"; a failed step is fixed and the row
re-run before the feature register changes.

| Role | Pass | Date | Build (debug / release) | Device / Android | Result (pass / fail) | Notes |
|---|---|---|---|---|---|---|
| Farmer | T | | | | | |
| Farmer | F | | | | | |
| Farmer | D | | | | | |
| Buyer | T | | | | | |
| Buyer | F | | | | | |
| Buyer | D | | | | | |
| Dealer + Inventory | T | | | | | |
| Dealer + Inventory | F | | | | | |
| Dealer + Inventory | D | | | | | |
| Expert | T | | | | | |
| Expert | F | | | | | |
| Expert | D | | | | | |
| Admin | T | | | | | |
| Admin | F | | | | | |
| Admin | D | | | | | |
