-- P6 (item 1): init-plan rewrite of every row-level-security policy.
--
-- Postgres re-evaluates a bare `auth.uid()` or `is_admin()` call in a policy for every row it inspects;
-- wrapped as `(select ...)` it is an InitPlan, evaluated once per statement (Supabase advisor
-- `auth_rls_initplan`). The rule each policy enforces is unchanged: every definition below is the
-- policy's previous text with only those calls wrapped, generated from pg_policies and checked by
-- supabase/tests/database (un-wrapping the new text reproduces the old text exactly).
-- `alter policy` keeps the policy in force throughout, so there is no window with a policy missing.
-- The three helpers stay executable by anon and authenticated: policies call them as the querying role.
-- 83 policies rewritten.

alter policy "audit_logs_insert_admin" on public.audit_logs
  with check ((select public.is_admin()));

alter policy "audit_logs_select_admin" on public.audit_logs
  using ((select public.is_admin()));

alter policy "categories_admin_write" on public.categories
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "consultation_messages_insert_participant" on public.consultation_messages
  with check (((sender_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (EXISTS ( SELECT 1
   FROM consultations c
  WHERE ((c.id = consultation_messages.consultation_id) AND ((c.user_id = (select auth.uid())) OR (c.expert_id = (select auth.uid()))))))));

alter policy "consultation_messages_select_participants" on public.consultation_messages
  using ((EXISTS ( SELECT 1
   FROM consultations c
  WHERE ((c.id = consultation_messages.consultation_id) AND ((c.user_id = (select auth.uid())) OR (c.expert_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "consultations_insert_requester" on public.consultations
  with check (((user_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "consultations_select_participants" on public.consultations
  using (((user_id = (select auth.uid())) OR (expert_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "consultations_update_participants" on public.consultations
  using ((((user_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())))
  with check ((((user_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())));

alter policy "conversations_insert_participant" on public.conversations
  with check ((((participant_one = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((participant_two = (select auth.uid())) AND (NOT (select public.is_suspended())))));

alter policy "conversations_select_participants" on public.conversations
  using (((participant_one = (select auth.uid())) OR (participant_two = (select auth.uid()))));

alter policy "crops_admin_write" on public.crops
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

alter policy "currencies_admin_write" on public.currencies
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

alter policy "dealer_stores_owner_write" on public.dealer_stores
  using (((dealer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))))
  with check (((dealer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "dealer_stores_select_owner_or_admin" on public.dealer_stores
  using (((dealer_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "disease_cases_insert_owner" on public.disease_cases
  with check (((user_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "disease_cases_select_owner_or_admin" on public.disease_cases
  using (((user_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "disease_predictions_select_owner_or_admin" on public.disease_predictions
  using ((EXISTS ( SELECT 1
   FROM disease_cases dc
  WHERE ((dc.id = disease_predictions.disease_case_id) AND ((dc.user_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "expert_specializations_owner_write" on public.expert_specializations
  using ((((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())))
  with check ((((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())));

alter policy "expert_verifications_admin_update" on public.expert_verifications
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

alter policy "expert_verifications_insert_owner" on public.expert_verifications
  with check (((expert_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "expert_verifications_select_owner_or_admin" on public.expert_verifications
  using (((expert_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "experts_insert_own" on public.experts
  with check (((id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "experts_select_verified_or_own_or_admin" on public.experts
  using (((verification_status = 'approved'::verification_status) OR (id = (select auth.uid())) OR (select public.is_admin())));

alter policy "experts_update_own_or_admin" on public.experts
  using ((((id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())))
  with check ((((id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())));

alter policy "farm_crops_owner_write" on public.farm_crops
  using ((EXISTS ( SELECT 1
   FROM farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin()))))))
  with check ((EXISTS ( SELECT 1
   FROM farms f
  WHERE ((f.id = farm_crops.farm_id) AND (((f.owner_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin()))))));

alter policy "farm_crops_select_owner_or_admin" on public.farm_crops
  using ((EXISTS ( SELECT 1
   FROM farms f
  WHERE ((f.id = farm_crops.farm_id) AND ((f.owner_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "farmer_profiles_owner_write" on public.farmer_profiles
  using ((((id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())))
  with check ((((id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())));

alter policy "farmer_profiles_select_own_or_admin" on public.farmer_profiles
  using (((id = (select auth.uid())) OR (select public.is_admin())));

alter policy "farms_owner_write" on public.farms
  using ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())))
  with check ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())));

alter policy "farms_select_owner_or_admin" on public.farms
  using (((owner_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "inventory_owner_write" on public.inventory
  using (((dealer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))))
  with check (((dealer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "inventory_select_owner_or_admin" on public.inventory
  using (((dealer_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "inventory_transactions_owner_insert" on public.inventory_transactions
  with check ((EXISTS ( SELECT 1
   FROM inventory i
  WHERE ((i.id = inventory_transactions.inventory_id) AND (i.dealer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))))));

alter policy "inventory_transactions_select_owner_or_admin" on public.inventory_transactions
  using ((EXISTS ( SELECT 1
   FROM inventory i
  WHERE ((i.id = inventory_transactions.inventory_id) AND ((i.dealer_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "listing_views_insert_authenticated" on public.listing_views
  with check ((((viewer_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (NOT (EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_views.listing_id) AND (l.owner_id = (select auth.uid()))))))) OR (viewer_id IS NULL)));

alter policy "listing_views_select_owner_or_admin" on public.listing_views
  using ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_views.listing_id) AND ((l.owner_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "listings_owner_write" on public.listings
  using ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())))
  with check ((((owner_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin())));

alter policy "listings_select_active_or_owner" on public.listings
  using (((status = 'active'::listing_status) OR (owner_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "messages_insert_participant" on public.messages
  with check (((sender_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_one = (select auth.uid())) OR (c.participant_two = (select auth.uid()))))))));

alter policy "messages_select_participants" on public.messages
  using (((select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND ((c.participant_one = (select auth.uid())) OR (c.participant_two = (select auth.uid()))))))));

alter policy "messages_update_admin" on public.messages
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

alter policy "messages_update_participant_read_receipt" on public.messages
  using ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (((c.participant_one = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((c.participant_two = (select auth.uid())) AND (NOT (select public.is_suspended()))))))))
  with check ((EXISTS ( SELECT 1
   FROM conversations c
  WHERE ((c.id = messages.conversation_id) AND (((c.participant_one = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((c.participant_two = (select auth.uid())) AND (NOT (select public.is_suspended()))))))));

alter policy "notifications_select_own" on public.notifications
  using ((user_id = (select auth.uid())));

alter policy "notifications_update_own" on public.notifications
  using (((user_id = (select auth.uid())) AND (NOT (select public.is_suspended()))))
  with check (((user_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "order_items_insert_buyer" on public.order_items
  with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.buyer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))))));

alter policy "order_items_select_participants" on public.order_items
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND ((o.buyer_id = (select auth.uid())) OR (o.seller_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "order_status_history_insert_participants" on public.order_status_history
  with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_status_history.order_id) AND (((o.buyer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((o.seller_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin()))))));

alter policy "order_status_history_select_participants" on public.order_status_history
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_status_history.order_id) AND ((o.buyer_id = (select auth.uid())) OR (o.seller_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "orders_insert_buyer" on public.orders
  with check (((buyer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "orders_select_participants" on public.orders
  using (((buyer_id = (select auth.uid())) OR (seller_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "orders_update_participants" on public.orders
  using ((((buyer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((seller_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((select public.is_admin()) AND (status = 'disputed'::order_status))))
  with check ((((buyer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((seller_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR ((select public.is_admin()) AND (status = ANY (ARRAY['refunded'::order_status, 'completed'::order_status])))));

alter policy "payment_transactions_insert_order_seller_or_admin" on public.payment_transactions
  with check ((EXISTS ( SELECT 1
   FROM (payments p
     JOIN orders o ON ((o.id = p.order_id)))
  WHERE ((p.id = payment_transactions.payment_id) AND (((o.seller_id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin()))))));

alter policy "payment_transactions_select_order_seller" on public.payment_transactions
  using ((EXISTS ( SELECT 1
   FROM (payments p
     JOIN orders o ON ((o.id = p.order_id)))
  WHERE ((p.id = payment_transactions.payment_id) AND ((o.seller_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "payment_transactions_select_owner_or_admin" on public.payment_transactions
  using ((EXISTS ( SELECT 1
   FROM payments p
  WHERE ((p.id = payment_transactions.payment_id) AND ((p.buyer_id = (select auth.uid())) OR (select public.is_admin()))))));

alter policy "payments_insert_buyer" on public.payments
  with check (((buyer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "payments_select_order_participants" on public.payments
  using (((buyer_id = (select auth.uid())) OR (select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = payments.order_id) AND (o.seller_id = (select auth.uid())))))));

alter policy "payments_update_order_seller_or_admin" on public.payments
  using (((select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = payments.order_id) AND (o.seller_id = (select auth.uid())) AND (NOT (select public.is_suspended())))))))
  with check (((select public.is_admin()) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = payments.order_id) AND (o.seller_id = (select auth.uid())) AND (NOT (select public.is_suspended())))))));

alter policy "profiles_select_own_or_admin" on public.profiles
  using (((id = (select auth.uid())) OR (select public.is_admin())));

alter policy "profiles_update_own_or_admin" on public.profiles
  using ((((id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin_aal2())))
  with check ((((id = (select auth.uid())) AND (NOT (select public.is_suspended()))) OR (select public.is_admin_aal2())));

alter policy "reports_admin_update" on public.reports
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

alter policy "reports_insert_reporter" on public.reports
  with check (((reporter_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "reports_select_own_or_admin" on public.reports
  using (((reporter_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "reviews_admin_delete" on public.reviews
  using ((select public.is_admin()));

alter policy "reviews_insert_buyer_completed_order_or_consultation" on public.reviews
  with check (((buyer_id = (select auth.uid())) AND (NOT (select public.is_suspended())) AND (((order_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = reviews.order_id) AND (o.buyer_id = (select auth.uid())) AND (o.status = 'completed'::order_status))))) OR ((consultation_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM consultations c
  WHERE ((c.id = reviews.consultation_id) AND (c.user_id = (select auth.uid())) AND (c.status = ANY (ARRAY['resolved'::consultation_status, 'closed'::consultation_status])))))))));

alter policy "suppliers_owner_write" on public.suppliers
  using (((dealer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))))
  with check (((dealer_id = (select auth.uid())) AND (NOT (select public.is_suspended()))));

alter policy "suppliers_select_owner_or_admin" on public.suppliers
  using (((dealer_id = (select auth.uid())) OR (select public.is_admin())));

alter policy "units_admin_write" on public.units
  using ((select public.is_admin_aal2()))
  with check ((select public.is_admin_aal2()));

alter policy "avatars_owner_delete" on storage.objects
  using (((bucket_id = 'avatars'::text) AND (owner = (select auth.uid()))));

alter policy "avatars_owner_update" on storage.objects
  using (((bucket_id = 'avatars'::text) AND (owner = (select auth.uid()))));

alter policy "avatars_owner_write" on storage.objects
  with check (((bucket_id = 'avatars'::text) AND (owner = (select auth.uid()))));

alter policy "consultation_attachments_participant_insert" on storage.objects
  with check (((bucket_id = 'consultation-attachments'::text) AND (owner = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM consultations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.user_id = (select auth.uid())) OR (c.expert_id = (select auth.uid()))))))));

alter policy "consultation_attachments_select_participants" on storage.objects
  using (((bucket_id = 'consultation-attachments'::text) AND (EXISTS ( SELECT 1
   FROM consultations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.user_id = (select auth.uid())) OR (c.expert_id = (select auth.uid())) OR (select public.is_admin())))))));

alter policy "disease_images_owner_delete" on storage.objects
  using (((bucket_id = 'disease-images'::text) AND (owner = (select auth.uid())) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));

alter policy "disease_images_owner_or_admin_read" on storage.objects
  using (((bucket_id = 'disease-images'::text) AND ((owner = (select auth.uid())) OR (select public.is_admin()))));

alter policy "disease_images_owner_update" on storage.objects
  using (((bucket_id = 'disease-images'::text) AND (owner = (select auth.uid())) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));

alter policy "disease_images_owner_write" on storage.objects
  with check (((bucket_id = 'disease-images'::text) AND (owner = (select auth.uid())) AND ((storage.foldername(name))[1] = ((select auth.uid()))::text)));

alter policy "expert_documents_owner_or_admin_read" on storage.objects
  using (((bucket_id = 'expert-documents'::text) AND ((owner = (select auth.uid())) OR (select public.is_admin()))));

alter policy "expert_documents_owner_write" on storage.objects
  with check (((bucket_id = 'expert-documents'::text) AND (owner = (select auth.uid()))));

alter policy "listing_images_owner_delete" on storage.objects
  using (((bucket_id = 'listing-images'::text) AND (owner = (select auth.uid()))));

alter policy "listing_images_owner_update" on storage.objects
  using (((bucket_id = 'listing-images'::text) AND (owner = (select auth.uid()))));

alter policy "listing_images_owner_write" on storage.objects
  with check (((bucket_id = 'listing-images'::text) AND (owner = (select auth.uid()))));

alter policy "message_attachments_participant_insert" on storage.objects
  with check (((bucket_id = 'message-attachments'::text) AND (owner = (select auth.uid())) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.participant_one = (select auth.uid())) OR (c.participant_two = (select auth.uid()))))))));

alter policy "message_attachments_select_participants" on storage.objects
  using (((bucket_id = 'message-attachments'::text) AND (EXISTS ( SELECT 1
   FROM conversations c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND ((c.participant_one = (select auth.uid())) OR (c.participant_two = (select auth.uid()))))))));
