# ZaraiLink code map

A quick guide to where each feature lives. Each row goes from the screen the user sees to the backend route and the
database tables behind it. Every module folder also has its own `README.md` with more detail.

## How one request flows

```
Screen (frontend/<module>/screens)
  → hook (frontend/<module>/hooks, React Query)
  → API client (frontend/services/api/client.ts, generated from the OpenAPI document)
  → FastAPI router (backend/app/<module>/router.py)          checks the JWT: backend/app/auth/
  → service (backend/app/<module>/service.py)                business rules
  → repository (backend/app/<module>/repository.py)          the only place that talks to the database
  → Supabase PostgreSQL (supabase/migrations)                row-level security decides who sees which row
```

Some reads (sign-in, realtime chat and notifications) go straight to Supabase through
`frontend/services/supabase/client.ts`. Row-level security still protects them.

## App start-up

| What | File |
|---|---|
| App entry, providers (React Query, toasts, error boundary) | `App.tsx` |
| Who sees which shell (guest, auth, approval, role tabs, admin) | `frontend/navigation/stacks/RootNavigator.tsx` |
| Signed-in role tabs | `frontend/navigation/stacks/AppNavigator.tsx` |
| Deep links (password reset, approval) | `frontend/navigation/linking.ts` |
| Signed-in user and session | `frontend/state/authStore.ts` |
| Cart and checkout state | `frontend/state/cartStore.ts`, `frontend/state/checkoutIntentStore.ts` |
| Colours, fonts, spacing (design system) | `frontend/theme/` |
| Shared buttons, cards, inputs, `StatusBadge` | `frontend/common/components/` |
| Environment values (`EXPO_PUBLIC_*`) | `frontend/config/env.ts` |
| Backend entry, middleware, error format | `backend/app/main.py`, `backend/app/middleware/`, `backend/app/common/problem_details.py` |
| All API routes mounted under `/api/v1` | `backend/app/api_router.py` |
| JWT check and the role/approval guard | `backend/app/auth/jwt_verifier.py`, `backend/app/auth/dependencies.py` |
| Database client | `backend/app/database/supabase_client.py` |
| Settings read from `backend/.env` | `backend/app/config/settings.py` |

## Features

| Feature | Screens (`frontend/…`) | Backend (`backend/app/…`) | Main tables |
|---|---|---|---|
| Sign-in, register, OTP, password reset, MFA | `common/auth/screens/` (Login, Register, CreateAccount, VerifyOtp, ForgotPassword, ResetPassword, SecondFactor) | Supabase Auth + `auth/` | `profiles` |
| Dealer/Expert application and approval status | `common/auth/screens/ApplicationWizardScreen.tsx`, `ApplicationStatusScreen.tsx`, `ApprovalGrantedScreen.tsx` | `common/application_documents.py`, `common/account_status.py` | `dealer_profiles`, `dealer_documents`, `experts`, `expert_documents`, `required_documents` |
| Profile and settings | `common/profile/screens/` | `common/profile/` | `profiles` |
| Marketplace (browse, listing, create/edit) | `common/marketplace/screens/` | `common/marketplace/` | `listings`, `categories`, `listing_views` |
| Cart, checkout, orders, dispatch | `common/orders/screens/` | `common/orders/` | `orders`, `order_items`, `order_events`, `order_status_history` |
| Payments (cash on delivery, bank transfer) | `common/payments/screens/` | `common/payments/` | `payments`, `payment_transactions` |
| Reviews | `common/reviews/screens/WriteReviewScreen.tsx` | `common/reviews/` | `reviews` |
| Messaging | `common/messaging/screens/` | `common/messaging/` | `conversations`, `messages` |
| Notifications | `common/notifications/screens/` | `common/notifications/` | `notifications` |
| Expert consultations | `common/consultations/screens/` | `common/consultations/` | `consultations`, `consultation_messages`, `consultation_assessments` |
| Analytics (per role) | `farmer/`, `dealer/`, `expert/`, `admin/` `AnalyticsScreen.tsx` | `common/analytics/` | reads orders and listings |
| Reference data (cities, units, crops) | used inside forms | `common/reference_data/` | `countries`, `provinces`, `cities`, `units`, `crops`, `currencies` |
| Farmer: farms and crops | `farmer/screens/` | `farmer/` | `farms`, `farm_crops`, `farmer_profiles` |
| Buyer: dashboard, wishlist | `buyer/screens/` | shared modules | `orders`, `listings` |
| Dealer: dashboard, business details | `dealer/screens/` | `dealer/` | `dealer_profiles`, `dealer_stores` |
| Expert: dashboard, application | `expert/screens/` | `expert/` | `experts`, `expert_specializations`, `expert_verifications` |
| AI disease scan | `ai/screens/` (Upload, Processing, Result) | `ai/` (`engine.py` runs the model) | `disease_cases`, `disease_predictions`, `disease_knowledge` |
| Dealer Inventory System | `inventory/screens/` (Dashboard, Products, Stock, Operation, Purchases, Suppliers, Locations, Alerts, Reports, Reconciliation, SyncLog) | `inventory/` (one file per area: `products.py`, `stock.py`, `movements.py`, `purchasing.py`, `alerts.py`, `reports.py`, `sync.py`) | `inventory_products`, `inventory_stock`, `inventory_movements`, `inventory_locations`, `inventory_suppliers`, `inventory_purchases`, `inventory_purchase_items`, `inventory_alert_settings`, `inventory_sync_log` |
| Admin console | `admin/screens/` (Approvals, Users, Listings, Orders, Reviews, Reports, Consultations, AI activity, Reference data, Audit log) | `admin/` | `audit_logs`, `reports`, and the tables above |

## Where the business rules live

| Rule | Meaning | Enforced in |
|---|---|---|
| BR-03/04 | Inventory is private to its dealer | `supabase/migrations/20260822090200_dealer_domain.sql` (RLS), `backend/app/inventory/`, `backend/app/dealer/service.py` |
| BR-09 | Delivery charge is its own line | `backend/app/common/orders/service.py`, `frontend/common/components/PriceBreakdown.tsx` |
| BR-10 | No logistics or courier entities | `backend/app/common/orders/`, `frontend/common/constants/status.ts` |
| BR-11 | No escrow, wallet or held funds | `backend/app/common/orders/service.py`, `backend/app/common/payments/` |
| BR-13 | AI results are advice and go to an expert | `backend/app/ai/`, `frontend/ai/screens/DiseaseResultScreen.tsx` |
| BR-15 | Every admin action is audit-logged | `backend/app/admin/service.py`, `backend/app/common/audit_events.py` |

## Other folders

| Folder | What is in it |
|---|---|
| `supabase/migrations/` | Every database change, in date order (tables, RLS policies, functions, storage buckets) |
| `supabase/tests/` | pgTAP tests for the database rules |
| `backend/tests/` | Backend tests, one folder per module |
| `frontend/**/__tests__/` | App tests (Jest) |
| `scripts/` | Quality gates (`check_reality.py`) and the model-weight download |
| `docs/` | SRDS (`srds.md`), plans (`plan*.md`), database schema (`database/schema.md`), setup guides |
