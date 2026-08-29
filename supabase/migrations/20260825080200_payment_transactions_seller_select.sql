-- Module 10 follow-up: the seller who now writes payment_transactions rows (previous
-- migration) couldn't read them back — the original select policy only covered the buyer.
-- Adds a second permissive select policy for the order's seller, mirroring the insert policy's
-- scoping exactly (both check `orders.seller_id = auth.uid()`, not role alone).

create policy "payment_transactions_select_order_seller"
  on public.payment_transactions for select
  using (
    exists (
      select 1 from public.payments p
      join public.orders o on o.id = p.order_id
      where p.id = payment_id and (o.seller_id = auth.uid() or public.is_admin())
    )
  );
