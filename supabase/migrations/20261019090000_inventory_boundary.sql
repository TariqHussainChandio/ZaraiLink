-- B0: a dealer's inventory is theirs alone (SRDS §15-§16, §49-§50; BR-03/04). Only the approved dealer who owns a row
-- reads it; the admin, who moderates the marketplace, reads none of it, and a pending, rejected or demoted dealer reads
-- nothing either. The write policies already required an approved, unsuspended owner (20261005080000_account_status);
-- these were the reads that still let the admin in and asked nothing about approval.
--
-- A suspended dealer keeps read access to their own rows, as everywhere else in the schema (rls_suspension_enforcement:
-- suspended users may read but not write). The marketplace still learns only what it must, through definer functions
-- that answer per listing (available_stock, listing_availability) and the dispatch trigger.

drop policy "dealer_stores_select_owner_or_admin" on public.dealer_stores;
create policy "dealer_stores_select_owner" on public.dealer_stores for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));

drop policy "suppliers_select_owner_or_admin" on public.suppliers;
create policy "suppliers_select_owner" on public.suppliers for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));

drop policy "inventory_select_owner_or_admin" on public.inventory;
create policy "inventory_select_owner" on public.inventory for select
  using (dealer_id = (select auth.uid()) and (select public.is_approved_dealer()));

drop policy "inventory_transactions_select_owner_or_admin" on public.inventory_transactions;
create policy "inventory_transactions_select_owner" on public.inventory_transactions for select
  using (exists (
    select 1
    from public.inventory i
    where i.id = inventory_transactions.inventory_id
      and i.dealer_id = (select auth.uid())
      and (select public.is_approved_dealer())
  ));
