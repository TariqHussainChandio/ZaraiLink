-- Module 10 (Payments, §14; BR-11/BR-14). `payments` (Module 4) shipped with select+insert
-- only — no one could ever mark a payment as received, which blocks the manual/COD flow this
-- module builds (no real gateway sandbox credentials are available yet, so payment
-- confirmation is a human action: the seller confirms cash/bank-transfer receipt, not an
-- automated provider callback). This adds the missing update path, scoped and column-guarded
-- rather than opened wide:
--   - only the order's seller (or admin) may update a payment row — never the buyer, since a
--     buyer self-marking their own payment "successful" would be trivially exploitable
--   - even the seller may only ever change `status` — amount/order/buyer/method/provider/
--     provider_transaction_ref stay fixed once the buyer creates the payment record, same
--     column-guard pattern as guard_profiles_role/guard_experts_verification_status

create or replace function public.guard_payments_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() and (
    new.order_id is distinct from old.order_id or
    new.buyer_id is distinct from old.buyer_id or
    new.amount is distinct from old.amount or
    new.currency is distinct from old.currency or
    new.method is distinct from old.method or
    new.provider is distinct from old.provider or
    new.provider_transaction_ref is distinct from old.provider_transaction_ref
  ) then
    raise exception 'Only status may be updated on an existing payment';
  end if;
  return new;
end;
$$;

create trigger guard_payments_columns
  before update on public.payments
  for each row execute function public.guard_payments_columns();

create policy "payments_update_order_seller_or_admin"
  on public.payments for update
  using (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid())
  );

grant update on public.payments to authenticated;
