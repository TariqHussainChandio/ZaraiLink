# common/orders (app)

Cart (one card per seller), checkout (delivery, who is paid, and the way to pay per seller; it also starts each payment), order history and order detail with status changes. The delivery charge is its own line (BR-09); there are no logistics entities (BR-10).

- **Owner lane:** `zl-commerce` (docs/plan.md §3)
- **SRDS:** §26–§29
- **API side:** [`backend/app/common/orders`](../../../backend/app/common/orders/README.md)

## Public API

Other modules import only what [`index.ts`](index.ts) exports; the reality gate's `module-boundary` rule fails a deep import. Today: `OrderCard`, `useOrderDetail`, `useOrderPaymentContext`, `useOrders`, `OrderStatus`, `OrderWithItems`.

## Inside

`components/` · `hooks/` · `screens/` (4) · `services/` · `types/`. Tests sit beside the code they test.
