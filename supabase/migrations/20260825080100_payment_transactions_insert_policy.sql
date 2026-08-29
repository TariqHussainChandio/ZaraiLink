-- Module 10 (Payments): `payment_transactions` (Module 4) shipped select-only, written by "the
-- backend service-role" — but that assumed a real payment gateway posting webhook events
-- server-side. This project has no backend yet (Module 19) and no gateway (manual/COD flow,
-- Module 10), so the event log has to be written by the client action that actually confirms or
-- fails a payment: the order's seller. Scoped the same way as `payments_update_order_seller_or_admin`
-- — only the seller of the payment's order (or admin) may insert an event row, and only for a
-- payment that already exists (append-only log, no update/delete path added).

create policy "payment_transactions_insert_order_seller_or_admin"
  on public.payment_transactions for insert
  with check (
    exists (
      select 1 from public.payments p
      join public.orders o on o.id = p.order_id
      where p.id = payment_id and (o.seller_id = auth.uid() or public.is_admin())
    )
  );

grant insert on public.payment_transactions to authenticated;
