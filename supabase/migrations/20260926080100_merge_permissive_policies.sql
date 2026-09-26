-- P6 (item 2): one permissive policy per table, role and command.
--
-- Two permissive policies for the same command are both evaluated for every row (Supabase advisor
-- `multiple_permissive_policies`). Two shapes of overlap are removed here without changing who can do what:
--   1. A `for all` write policy overlapped the table's select policy. It is split into insert, update and
--      delete policies with the same predicate. Select is now governed by the select policy alone; that
--      loses nothing, because in every case below the write predicate is already a subset of the select
--      predicate (checked table by table when this was written: owner or admin write, owner or admin or
--      public read).
--   2. Two permissive policies for one command are merged with OR, which is how Postgres combines them:
--      messages update (participant read receipt, admin) and payment_transactions select (buyer, seller).
-- After this migration the advisor reports no multiple_permissive_policies finding (storage.objects included).

drop policy "categories_admin_write" on public.categories;
create policy "categories_admin_insert" on public.categories for insert with check (( SELECT is_admin() AS is_admin));
create policy "categories_admin_update" on public.categories for update using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "categories_admin_delete" on public.categories for delete using (( SELECT is_admin() AS is_admin));

drop policy "crops_admin_write" on public.crops;
create policy "crops_admin_insert" on public.crops for insert with check (( SELECT is_admin() AS is_admin));
create policy "crops_admin_update" on public.crops for update using (( SELECT is_admin() AS is_admin)) with check (( SELECT is_admin() AS is_admin));
create policy "crops_admin_delete" on public.crops for delete using (( SELECT is_admin() AS is_admin));

drop policy "currencies_admin_write" on public.currencies;
create policy "currencies_admin_insert" on public.currencies for insert with check (( SELECT is_admin_aal2() AS is_admin_aal2));
create policy "currencies_admin_update" on public.currencies for update using (( SELECT is_admin_aal2() AS is_admin_aal2)) with check (( SELECT is_admin_aal2() AS is_admin_aal2));
create policy "currencies_admin_delete" on public.currencies for delete using (( SELECT is_admin_aal2() AS is_admin_aal2));

drop policy "units_admin_write" on public.units;
create policy "units_admin_insert" on public.units for insert with check (( SELECT is_admin_aal2() AS is_admin_aal2));
create policy "units_admin_update" on public.units for update using (( SELECT is_admin_aal2() AS is_admin_aal2)) with check (( SELECT is_admin_aal2() AS is_admin_aal2));
create policy "units_admin_delete" on public.units for delete using (( SELECT is_admin_aal2() AS is_admin_aal2));

drop policy "dealer_stores_owner_write" on public.dealer_stores;
create policy "dealer_stores_owner_insert" on public.dealer_stores for insert with check (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));
create policy "dealer_stores_owner_update" on public.dealer_stores for update using (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended)))) with check (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));
create policy "dealer_stores_owner_delete" on public.dealer_stores for delete using (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));

drop policy "expert_specializations_owner_write" on public.expert_specializations;
create policy "expert_specializations_owner_insert" on public.expert_specializations for insert with check ((((expert_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));
create policy "expert_specializations_owner_update" on public.expert_specializations for update using ((((expert_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin))) with check ((((expert_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));
create policy "expert_specializations_owner_delete" on public.expert_specializations for delete using ((((expert_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));

drop policy "farm_crops_owner_write" on public.farm_crops;
create policy "farm_crops_owner_insert" on public.farm_crops for insert with check ((EXISTS ( SELECT 1
   FROM farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin))))));
create policy "farm_crops_owner_update" on public.farm_crops for update using ((EXISTS ( SELECT 1
   FROM farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)))))) with check ((EXISTS ( SELECT 1
   FROM farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin))))));
create policy "farm_crops_owner_delete" on public.farm_crops for delete using ((EXISTS ( SELECT 1
   FROM farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin))))));

-- farmer_profiles: no delete policy is recreated. `authenticated` has no DELETE grant on the table, so a delete
-- policy could never apply (the pgTAP mutation check reported it unreachable). Account deletion anonymises.
drop policy "farmer_profiles_owner_write" on public.farmer_profiles;
create policy "farmer_profiles_owner_insert" on public.farmer_profiles for insert with check ((((id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));
create policy "farmer_profiles_owner_update" on public.farmer_profiles for update using ((((id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin))) with check ((((id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));

drop policy "farms_owner_write" on public.farms;
create policy "farms_owner_insert" on public.farms for insert with check ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));
create policy "farms_owner_update" on public.farms for update using ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin))) with check ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));
create policy "farms_owner_delete" on public.farms for delete using ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));

drop policy "inventory_owner_write" on public.inventory;
create policy "inventory_owner_insert" on public.inventory for insert with check (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));
create policy "inventory_owner_update" on public.inventory for update using (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended)))) with check (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));
create policy "inventory_owner_delete" on public.inventory for delete using (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));

drop policy "listings_owner_write" on public.listings;
create policy "listings_owner_insert" on public.listings for insert with check ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));
create policy "listings_owner_update" on public.listings for update using ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin))) with check ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));
create policy "listings_owner_delete" on public.listings for delete using ((((owner_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ( SELECT is_admin() AS is_admin)));

drop policy "suppliers_owner_write" on public.suppliers;
create policy "suppliers_owner_insert" on public.suppliers for insert with check (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));
create policy "suppliers_owner_update" on public.suppliers for update using (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended)))) with check (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));
create policy "suppliers_owner_delete" on public.suppliers for delete using (((dealer_id = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))));

drop policy "messages_update_admin" on public.messages;
drop policy "messages_update_participant_read_receipt" on public.messages;
-- Postgres ORs the USING expressions and, separately, the WITH CHECK expressions of permissive policies,
-- so one policy holding both ORs is equivalent. Column-level limits stay in the grant and guard trigger.
create policy "messages_update" on public.messages for update
  using ((( SELECT is_admin_aal2() AS is_admin_aal2)) OR ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (((c.participant_one = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ((c.participant_two = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended)))))))))
  with check ((( SELECT is_admin_aal2() AS is_admin_aal2)) OR ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (((c.participant_one = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended))) OR ((c.participant_two = ( SELECT auth.uid() AS uid)) AND (NOT ( SELECT is_suspended() AS is_suspended)))))))));

drop policy "payment_transactions_select_order_seller" on public.payment_transactions;
drop policy "payment_transactions_select_owner_or_admin" on public.payment_transactions;
create policy "payment_transactions_select" on public.payment_transactions for select
  using (((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = payment_transactions.payment_id) AND ((p.buyer_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)))))) OR ((EXISTS ( SELECT 1
   FROM (payments p
     JOIN orders o ON ((o.id = p.order_id)))
  WHERE ((p.id = payment_transactions.payment_id) AND ((o.seller_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin)))))));
