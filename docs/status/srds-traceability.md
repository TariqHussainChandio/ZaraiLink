# SRDS traceability matrix

Every requirement in [`docs/srds.md`](../srds.md), where it stands today, the phase that delivers it, and the test that
proves it. Written in Plan A phase A0 (2026-09-27) against `main` at the merge of PR #11. Keep it current: a phase
that changes a row updates it in the same change, together with the [feature register](feature-register.md).

**Status:** **Met** — proven by the test named. **Met, untested** — the code does it, but no test proves that
exact path yet; the phase named adds one. **Partial** — part of the requirement works. **Not yet** — nothing, or something
the SRDS contradicts. Phases are in [`docs/plan-ecommerce.md`](../plan-ecommerce.md) (A0–A9) and
[`docs/plan-inventory.md`](../plan-inventory.md) (B0–B6). A test in *italics* is the one that phase must add.

Test locations: pgTAP `supabase/tests/database/`; backend real-stack `backend/tests/integration/` (smoke tests in
`smoke/`); backend unit `backend/tests/unit/`; app real-stack `src/hooks/api/*.realstack.test.tsx`. The app's
real-stack tests run locally only (`ZARAILINK_REALSTACK=1`, see `docs/setup/DEVELOPMENT_SETUP.md`); CI does not run
them until A9.

## 1. Requirements by SRDS section

| SRDS | Requirement | Status | Today | Phase | Proof |
|---|---|---|---|---|---|
| §1–§2 | Three areas: e-commerce platform, integrated AI advisory, private dealer IMS | Partial | Platform and AI exist; inventory is a set of screens inside the marketplace | A, B | The rows below |
| §3 | Exactly five roles | Met, untested | `user_role` enum: admin, farmer, buyer, dealer, expert. The sign-up tests prove the four public roles and that admin is refused, not that no sixth role exists | A3 | `test_signup_role_escalation.py`; *pgTAP asserting exactly these five enum labels* |
| §3 | Farmer and Buyer need only normal account verification | Met (local) | 6-digit email code; hosted: Gmail SMTP configured 2026-09-27 (G1), delivery not yet confirmed | A3 (G1) | `test_email_otp_templates.py` |
| §4 | Registration offers Farmer, Buyer, Dealer, Expert; never Admin | Met | `handle_new_user` allow-lists four roles | — | `test_public_signup_still_gets_the_role_it_legitimately_requested[farmer, buyer, dealer, expert]`, `test_public_signup_cannot_self_assign_the_admin_role` |
| §5 | Farmer fields: name, email, phone, password, country, province, city, village, address | Partial | Sign-up takes name, email, password, role; location is one free-text field on Edit Profile | A3 | *Real-stack sign-up stores each field; form test* |
| §6 | Buyer fields: as §5 without village | Partial | As §5 | A3 | *As §5* |
| §7 | Dealer registration: account, business name, address, location, type, registration details; configurable documents | Not yet | A dealer is active at sign-up; no business data or documents | A3 | *pgTAP for the application tables and document bucket; real-stack application test* |
| §8 | Dealer PENDING until approval; no dealer functionality while PENDING or REJECTED | Not yet | No dealer status | A3 | *Two-user proof: pending dealer refused, approved dealer allowed, through the API and PostgREST* |
| §9 | Approval email (confirmation, account, login instruction and destination, next steps); dealer logs in again | Not yet | No approval email | A3 (G1 for hosted) | *Real-stack: the approval email arrives in Mailpit; the old session loses dealer access until re-login* |
| §10 | Expert registration: specialization, years of experience, institution affiliation, documents (degrees, qualifications, experience, affiliation) | Partial | `experts`, `expert_verifications`, `expert-documents` bucket; application after sign-up; one document; no institution | A3 | `test_smoke_expert_application.py::test_a_pending_applicant_sees_their_own_profile_and_a_stranger_does_not`; *multi-document and institution fields* |
| §11 | Expert PENDING until approval; no protected expert functionality before | Partial | Consultations only reach verified experts, and an application starts pending and only an admin with a second factor decides it (migration `20260928090000`, local; hosted push pending); a pending expert can still open the workspace | A3 | `test_a_consultation_cannot_be_requested_from_an_expert_who_is_not_verified`, `test_the_database_refuses_a_consultation_shortcut_and_a_pending_expert`, `test_an_expert_cannot_apply_already_approved`, pgTAP `20260928090000_admin_write_scope`; *pending expert refused on every expert route* |
| §12 | Admin approval queues for dealers and experts with document inspection, approve and reject | Partial | Expert verification queue; no dealer queue | A3 | `test_smoke_admin_audit.py::test_an_expert_verification_decision_is_audited`; *dealer queue decisions, each with an audit row* |
| §13 | Account states PENDING, APPROVED/ACTIVE, REJECTED, SUSPENDED, enforced server-side | Partial | Suspension works for everyone; expert `verification_status`; no dealer status | A3 (contract "Account status") | `test_smoke_admin.py::test_suspend_and_unsuspend_a_user`; *`is_approved_dealer()` and `is_approved_expert()` in pgTAP* |
| §14 | Admin moderates users, applications, products, listings, orders, reviews, reports, consultations, AI activity, content, suspensions, audit logs | Partial | Users, listings, experts, reviews, reports, messages, categories, reference data, orders, disputes, audit log; no consultations, AI activity or dealer applications | A3, A7 | `test_smoke_admin_audit.py` (every admin-only write route audited; the 25 routes open to every signed-in user are outside it, see §51); *one test per new moderation route* |
| §15 | Admin has no operational access to dealer stock, storage, adjustments, suppliers, internal reports | Not yet | Admin policies read `inventory`, `inventory_transactions`, `dealer_stores`, `suppliers` | B0 | *pgTAP: the admin is refused on every inventory table; no admin route reads inventory* |
| §16 | Only an approved dealer gets the Inventory Management option | Not yet | Every dealer reaches inventory screens | B4 (after A3) | *Unapproved dealer never sees the tile or reaches a screen (app test and emulator)* |
| §17 | IMS with its own interface: dashboard, products/SKUs, stock, locations, suppliers, movements, adjustments, alerts, purchases, reports, analytics, settings | Partial | Inventory list, movement history, stores, suppliers, analytics, low-stock notification, inside the marketplace | B1, B2, B4, B5 | `dealer.realstack.test.tsx`; *real-stack test per IMS endpoint with two dealers; emulator run of every IMS flow* |
| §18 | IMS dashboard: totals, low and out of stock, value, recent movements, adjustments, restocks, alerts, trends | Not yet | — | B2, B4 | *Dashboard figures match a scripted ledger* |
| §19 | Stock falls automatically when an order is dispatched, with a `ZARAILINK_ORDER` movement carrying the order id | Not yet | Stock is committed when the seller confirms; the movement has no order reference | A4, B3 | *Dispatch deducts once and writes the movement with the order id* |
| §20 | Dispatch is the trigger; placed, confirmed or cancelled orders deduct nothing | Not yet | Confirm-time commit | A4, B3 | *Cancelling before dispatch deducts nothing* |
| §21 | Sync is transaction-safe, idempotent and auditable | Not yet | Today's confirm-time commit is atomic and once per row | B1, B3 | `test_dealer_oversell_rejected_and_stock_stays_atomic`, `test_confirming_directly_still_commits_the_stock_once_and_leaves_history` (today's behaviour); *replay, double click and concurrent dispatch deduct once* |
| §22–§23 | Dealer records local sales, stock in, stock out and adjustments with reasons; each creates a movement | Partial | `adjust_stock` with a type and notes writes an `inventory_transactions` row | B1, B2 | *pgTAP: `record_movement` writes one ledger row with correct before and after* |
| §24 | Movement sources: ZARAILINK_ORDER, LOCAL_SALE, PURCHASE, RESTOCK, MANUAL_ADJUSTMENT, DAMAGE, EXPIRY, TRANSFER, OTHER | Not yet | Types addition, reduction, adjustment, sale, restock, correction; no source | B1 | *pgTAP on the source values; history filtered by source* |
| §25 | Reconciliation: marketplace + local sales + adjustments + restocks = current stock | Not yet | — | B1, B5 | *Identity holds for every product over a scripted month* |
| §26 | Buyers buy from farmers and from dealers | Met | Orders from a buyer to either seller | — | `03_policies_orders_and_payments.test.sql` (buyer → dealer), `20260927100000_stock_and_payment_integrity.test.sql` (buyer → farmer), `test_checkout_with_delivery_charge_and_br09_total_split` |
| §27 | Farmers buy from dealers | Met, untested | Checkout is open to farmers (`authorization_policy.json`, `POST /api/v1/orders/checkout`) | A4 | *Real-stack order placed by a farmer with a dealer* |
| §28 | Dealers buy from farmers | Met, untested | Checkout is open to dealers | A4 | *Real-stack order placed by a dealer with a farmer* |
| §29 | Farmers and dealers act as buyers and sellers where the rules permit | Met, untested | Sellers must be farmers or dealers and nobody orders from themselves (proven); farmers and dealers buying is allowed but untested (§27–§28). Experts and the admin can also check out today; D9 would stop that | A4 (D9) | `20260927090000_order_payment_insert_guards.test.sql`, `test_a_forged_order_is_normalised_or_refused_and_cannot_be_used_to_review`; *the buying matrix as two-user tests* |
| §30 | Messaging: Buyer↔Dealer, Buyer↔Farmer, Dealer↔Farmer, Farmer↔Expert, inside the platform | Met, untested | Any two users can chat; farmer and expert talk in consultation threads. Proven: Buyer↔Farmer, Buyer↔Dealer, Farmer↔Expert. Dealer↔Farmer has no test | A5 | `test_smoke_messaging.py::test_send_and_list_messages` (buyer↔farmer), `04_policies_messaging_and_consultations.test.sql` (buyer starts one with a dealer), `test_smoke_consultations.py::test_send_message_with_recommended_listing_embed` (farmer↔expert); *dealer↔farmer* |
| §31 | Conversations only on a legitimate relationship, authorized server-side | Partial | Only participants read and write, but a conversation can be opened with anyone | A5 (D12) | `test_non_participant_cannot_send_a_message`, `test_smoke_realtime_rls.py`; *every §30 pair with a context allowed, an unrelated pair refused (API and PostgREST)* |
| §32 | Farmer: Scan Disease → camera or gallery → AI API → prediction → report → advisory | Partial | The farmer dashboard offers Disease Advisory; the API creates a case and loads the real MobileNetV2 checkpoint (38 classes) fetched from Supabase Storage. Not proven: a prediction on a real leaf photo (the fixture is missing, so that test is always skipped) and the advisory step (§33). The API accepts any signed-in role (`authorization_policy.json`, `/api/v1/disease/*`); whether it should be farmers only is decided in A6 | A6 | `test_classifier_loads_the_real_checkpoint`, `src/screens/farmer/DashboardScreen.test.tsx` (the Disease Advisory entry), `test_disease_pipeline_end_to_end_on_a_database_built_only_from_migrations` (case creation; it runs as a buyer with a plain test image and accepts a 503); *`test_classifier_predicts_a_known_class_for_a_real_leaf_photo` with a real `sample_leaf.jpg` fixture; the pipeline test as a farmer* |
| §33 | Report: disease, confidence, symptoms, treatment, precautions, general advisory, disclaimer | Partial | Disease, confidence, description, recommended actions, disclaimer | A6 (D11) | *Contract test for the `AiReport` fields; result screen test* |
| §34 | The full AI report goes with the consultation request to the expert | Not yet | The consult form is prefilled with text and the photo; no link to the case | A6 | *Real-stack: a consultation from a case shows the report to the assigned expert only* |
| §35 | Expert sees an AI-assisted case summary | Not yet | — | A6 | *Expert screen test; emulator run* |
| §36 | Expert assessment kept apart from the AI assessment (agree, correct, add, recommend, ask, continue) | Not yet | Free-text messages only | A6 | *pgTAP: only the assigned expert writes an assessment; real-stack round trip* |
| §37 | AI failure leaves the marketplace, orders, payments, messaging, inventory and expert accounts working | Partial | Prediction answers 503 with a retry and "Talk to an expert" | A6 | `test_disease_service.py::test_predict_model_unavailable_returns_503`; *real-stack run with the model unloaded* |
| §38 | Repository organised by module: `frontend/`, `backend/`, `supabase/`, `tests/`, `docs/` | Not yet | Layered `src/` and `backend/app/{api,services,repositories,schemas,core,ml}` | A1 | *Module-boundary gate at zero* |
| §39–§41 | Each role, AI and inventory module owns its screens, components, services, hooks and types | Not yet | Code is grouped by layer | A1 | *Module-boundary gate* |
| §42 | `common/` holds only genuinely shared code | Not yet | — | A1 (D1) | *Module-boundary gate* |
| §43 | One theme: colors, typography, spacing, dimensions, shadows, borders, components | Partial | Colors, typography, spacing, motion, accents; no dimensions, borders or components files; 74 raw sizes, 24 raw border widths | A2 | *Raw-style gate at zero* |
| §44 | Role and module accents, centralised | Met, untested | Exactly the SRDS values in `src/theme/roleColors.ts` and `src/theme/moduleAccents.ts` | A2 | *Test asserting the SRDS accent values* |
| §45 | Supabase PostgreSQL holds application data; Supabase Storage holds files, with policies | Met | All data in PostgreSQL; seven buckets (avatars, listing images, disease images, expert documents, message and consultation attachments, `ml-models`), each covered by pgTAP; a dealer documents bucket arrives in A3 | A3 (dealer documents) | `05_policies_domains_and_storage.test.sql`, `20260928080000_ml_models_bucket.test.sql`, `test_disease_images_storage_policy.py` |
| §46 | Git and GitHub hold source code only | Met | Model in the private `ml-models` bucket (D13); GitHub release deleted; model and translation files purged from history; `*.pth` and `*.onnx` ignored | — | CI log: "Downloading model.pth from Supabase Storage (ml-models/…) … checksum-verified"; `20260928080000_ml_models_bucket.test.sql` |
| §47 | Module → services → API layer → FastAPI → services → repositories → Supabase; no module touches another's data | Partial | Screens → hooks → services gated; backend layered; no module gate | A1 | Reality gate (screens never import the service layer); *module-boundary gate* |
| §48 | Inventory and marketplace meet only through controlled APIs and events | Not yet | Marketplace writes inventory directly at confirm | A4, B3 | *`order_events` contract test; `listing_availability` contract test* |
| §49 | Data ownership: ZaraiLink owns accounts, marketplace, orders, reviews, consultations, AI records, moderation; the dealer owns stock, storage, suppliers, local sales, adjustments, reports | Partial | Dealer-only policies, but the admin can read inventory | B0 | `05_policies_domains_and_storage.test.sql` (another dealer refused); *admin refused (B0)* |
| §50 | No admin registration; dealer and expert approval; a dealer reaches only their own inventory | Partial | Admin registration refused; own-inventory enforced; approval not yet | A3, B0 | `test_public_signup_cannot_self_assign_the_admin_role`, `test_a_dealer_cannot_plant_inventory_on_another_sellers_listing`, `05_policies_domains_and_storage.test.sql` |
| §51 | Audit log of admin actions by SRDS name; inventory keeps its own history (added, removed, local sale, dispatch, adjustment, transfer) | Partial | Every admin-only write route leaves an `audit_logs` row. The 25 write routes open to every signed-in user are outside that guard; the listing edit and delete among them now match the owner only, and an admin moderates a listing only through the audited status route with a second factor (BR-15 defect fixed locally by migration `20260928090000`, hosted push pending). D9 in A4 closes checkout only. Inventory history has no sources | A3, A4, A7, B1 | `test_smoke_admin_audit.py`, `test_smoke_listing_ownership.py`; *SRDS event names; movement history by source* |
| §52 | Final system model | — | Summarised by the rows above | — | — |

## 2. SRDS §53: the forty non-negotiable rules

Today: **10 met, 5 met but untested, 8 partial, 17 not yet.** The Field Manual scorecard reads from this table.

| # | Rule | Status | Phase | Proof |
|---|---|---|---|---|
| 1 | Exactly five roles | Met, untested | A3 | *§3 row* |
| 2 | Public registration: Farmer, Buyer, Dealer, Expert | Met | — | `test_public_signup_still_gets_the_role_it_legitimately_requested` |
| 3 | No public Admin registration | Met | — | `test_public_signup_cannot_self_assign_the_admin_role` |
| 4 | Dealer registration requires business documentation | Not yet | A3 | *§7 row* |
| 5 | Expert registration requires degrees, experience, institution documentation | Partial | A3 | *§10 row* |
| 6 | Dealer and Expert PENDING until approval | Not yet | A3 | *§8, §11 rows* |
| 7 | Approval email | Not yet | A3 (G1) | *§9 row* |
| 8 | Log in again after approval | Not yet | A3 | *§9 row* |
| 9 | Normal members after approval | Not yet | A3 | *Approved dealer and expert reach every member feature* |
| 10 | All main functionality under admin moderation | Partial | A7 | *§14 row* |
| 11 | Inventory private to the dealer | Not yet | B0 | *§15 row* |
| 12 | Admin does not manage dealer inventory | Not yet | B0 | *§15 row* |
| 13 | Inventory has its own dashboard and UI | Not yet | B4 | *§17–§18 rows* |
| 14 | Orders sync inventory at dispatch | Not yet | A4, B3 | *§19 row* |
| 15 | Sync idempotent and auditable | Not yet | B1, B3 | *§21 row* |
| 16 | Dealers record local sales and stock changes | Partial | B1, B2 | *§22–§23 rows* |
| 17 | Buyers purchase from Farmers and Dealers | Met | — | §26 row |
| 18 | Farmers purchase from Dealers | Met, untested | A4 | *§27 row* |
| 19 | Dealers purchase from Farmers | Met, untested | A4 | *§28 row* |
| 20 | Messaging pairs supported | Met, untested | A5 | *§30 row (dealer↔farmer)* |
| 21 | AI is an integrated API-driven module | Met | — | `test_classifier_loads_the_real_checkpoint`; the `/api/v1/disease/*` routes are part of the one API (`test_smoke_authorization_matrix.py`) |
| 22 | Farmers reach AI through Scan Disease | Met | — | `src/screens/farmer/DashboardScreen.test.tsx` (the Disease Advisory entry on the farmer dashboard) |
| 23 | AI report includes result, advisory, treatment, precautions | Partial | A6 | *§33 row* |
| 24 | Complete AI report goes to the expert | Not yet | A6 | *§34 row* |
| 25 | Expert assessment distinguishable from AI | Not yet | A6 | *§36 row* |
| 26 | Modular directory by role and responsibility | Not yet | A1 | *§38 row* |
| 27 | Top-level modules for Admin, Farmer, Dealer, Buyer, Expert, AI, Inventory | Not yet | A1 | *§38–§41 rows* |
| 28 | Shared functionality in common | Not yet | A1 | *§42 row* |
| 29 | Design tokens in theme | Partial | A2 | *§43 row* |
| 30 | Supabase PostgreSQL is the database | Met | — | pgTAP suite, real-stack suite |
| 31 | Supabase Storage holds files | Met | — | §45 row |
| 32 | Git/GitHub only for source code | Met | — | §46 row |
| 33 | Module code stays in its module | Not yet | A1 | *Module-boundary gate* |
| 34 | Cross-module calls through defined services | Partial | A1 | *§47 row* |
| 35 | No escrow or held funds | Met | — | `01_structure.test.sql` ("BR-11: no escrow, wallet or held-funds columns") |
| 36 | Delivery is an explicit order charge | Met | — | `test_checkout_with_delivery_charge_and_br09_total_split` |
| 37 | No riders, vehicles, warehouses or logistics | Met, untested | A4 | `01_structure.test.sql` ("BR-10: no logistics tables") matches shipment, courier, delivery_, logistic, carrier and tracking, not rider, vehicle or warehouse; no such table exists today. *`zl-db` widens the pattern* |
| 38 | AI failure does not take down the platform | Partial | A6 | *§37 row* |
| 39 | Inventory failure does not take down the marketplace | Not yet | B3 | *IMS unavailable: marketplace browses and orders; the event is applied on recovery* |
| 40 | Authorization enforced server-side | Partial | A4, A5, A6, every phase | Every route and policy is enforced and tested (`test_smoke_authorization_matrix.py`, the pgTAP suite, policy mutation `scripts/db/policy_mutation.py` with 0 survivors). But three rules exist only in the app today: the disease API accepts every role (A6), the admin and experts can check out (A4, D9), and a conversation can be opened with anyone (A5) |
