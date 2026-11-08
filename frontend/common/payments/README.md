# common/payments (app)

Payment method and manual payment status (cash on delivery, bank transfer). No escrow, wallet or held funds (BR-11).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26
- **API side:** [`backend/app/common/payments`](../../../backend/app/common/payments/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `PaymentMethodOptions` (the radio group; bank transfer is shown disabled until sellers have account details), `PAYMENT_METHOD_NAMES`, `paymentMethodName`, `useInitiatePayment`, `useResolvePayment`, `fetchPaymentByOrderId`, `PaymentMethod`, `PaymentStatus`. A payment's status is shown with the shared `StatusBadge` (`kind="payment"`).

## Inside

`components/` · `hooks/` · `screens/` (3) · `services/` · `types/`. Tests sit beside the code they test.
