-- P6 (items 3, 4): structural rules that every migration must keep true, and the inventory of policies.
--
-- The policy inventory below is deliberate friction: adding, renaming or dropping a policy fails this test until
-- the list is edited, and the edit is the moment to add the matching allowed/rejected case in 02_* to 05_*.
begin;
\ir ../helpers/rls_helpers.inc
select plan(14);

select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'row-level security is enabled on every public table');

select is(
  (select count(*) from pg_policies
    where schemaname in ('public', 'storage')
      and regexp_replace(coalesce(qual, '') || ' ' || coalesce(with_check, ''),
            '\( SELECT (auth\.uid|is_admin|is_suspended|is_admin_aal2)\(\) AS \w+\)', '', 'g')
          ~ '(auth\.uid|is_admin|is_suspended|is_admin_aal2)\(\)'),
  0::bigint, 'no policy calls auth.uid() or an is_* helper per row (all wrapped in a select)');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  0::bigint, 'every security definer function pins search_path');

select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.proname <> 'rls_auto_enable'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%pg_temp%')),
  0::bigint, 'security definer functions list pg_temp last in search_path (rls_auto_enable pins pg_catalog only)');

select is(
  (select count(*) from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i
        where i.indrelid = c.conrelid and i.indisvalid
          and (i.indkey::int2[])[0:cardinality(c.conkey) - 1] = c.conkey)),
  0::bigint, 'every foreign key has an index that starts with its columns');

select is(
  (select count(*) from information_schema.tables t
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
      -- server-only tables, which no client may reach: the dispatch outbox (20261019080000_order_dispatch.sql)
      and t.table_name not in ('order_events')
      and not exists (select 1 from information_schema.role_table_grants g
        where g.table_schema = 'public' and g.table_name = t.table_name and g.grantee = 'authenticated')),
  0::bigint, 'every public table but the server-only ones has an explicit grant to authenticated (Data API needs it from 30 Oct 2026)');

select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee in ('anon', 'authenticated', 'service_role')
      and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0::bigint, 'no client role can truncate a table (TRUNCATE ignores row-level security) or add references or triggers');

select is(
  (select attgenerated::text from pg_attribute
    where attrelid = 'public.orders'::regclass and attname = 'total'),
  's', 'BR-09: orders.total is a stored generated column (delivery charge is its own line)');

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and column_name ~* '(escrow|wallet|held_|hold_|balance)'),
  0::bigint, 'BR-11: no escrow, wallet or held-funds columns');

select is(
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name ~* '(shipment|courier|delivery_|logistic|carrier|tracking|rider|vehicle|warehouse)'),
  0::bigint, 'BR-10: no logistics tables (no shipments, couriers, riders, vehicles or warehouses; A4 widened the names)');

select ok(has_function_privilege('anon', 'public.is_admin()', 'execute')
      and has_function_privilege('anon', 'public.is_suspended()', 'execute')
      and has_function_privilege('anon', 'public.is_admin_aal2()', 'execute'),
  'the policy helpers stay executable by anon (policies call them as the querying role)');

select ok(not has_function_privilege('anon', 'public.notify_new_order()', 'execute')
      and not has_function_privilege('authenticated', 'public.create_notification(uuid,text,jsonb,boolean)', 'execute')
      and not has_function_privilege('anon', 'public.available_stock(uuid[])', 'execute'),
  'trigger, notification-writer and stock functions are not callable by anon or clients');

select ok(exists (select 1 from pg_policies where tablename = 'profiles')
      and not exists (select 1 from pg_policies where policyname ilike '%allow_all%' or (qual = 'true' and cmd in ('INSERT','UPDATE','DELETE'))),
  'no policy grants blanket write access');

select is(
  (select array_agg(schemaname || '.' || tablename || '.' || policyname order by schemaname, tablename, policyname)
     from pg_policies where schemaname in ('public', 'storage')),
  array[
  'public.audit_event_names.audit_event_names_select_admin',
  'public.audit_logs.audit_logs_select_admin',
  'public.categories.categories_admin_delete',
  'public.categories.categories_admin_insert',
  'public.categories.categories_admin_update',
  'public.categories.categories_select_all',
  'public.consultation_assessments.consultation_assessments_insert_expert',
  'public.consultation_assessments.consultation_assessments_select_participants',
  'public.consultation_messages.consultation_messages_insert_participant',
  'public.consultation_messages.consultation_messages_select_participants',
  'public.consultations.consultations_insert_requester',
  'public.consultations.consultations_select_participants',
  'public.consultations.consultations_update_participants',
  'public.conversations.conversations_insert_related',
  'public.conversations.conversations_select_participants',
  'public.crops.crops_admin_delete',
  'public.crops.crops_admin_insert',
  'public.crops.crops_admin_update',
  'public.crops.crops_select_all',
  'public.currencies.currencies_admin_delete',
  'public.currencies.currencies_admin_insert',
  'public.currencies.currencies_admin_update',
  'public.currencies.currencies_select_all',
  'public.dealer_documents.dealer_documents_delete_own',
  'public.dealer_documents.dealer_documents_insert_own',
  'public.dealer_documents.dealer_documents_select_own_or_admin',
  'public.dealer_profiles.dealer_profiles_insert_own',
  'public.dealer_profiles.dealer_profiles_select_own_or_admin',
  'public.dealer_profiles.dealer_profiles_update_own',
  'public.disease_cases.disease_cases_insert_owner',
  'public.disease_cases.disease_cases_select_owner_or_admin',
  'public.disease_knowledge.disease_knowledge_admin_update',
  'public.disease_knowledge.disease_knowledge_select_authenticated',
  'public.disease_predictions.disease_predictions_select_owner_or_admin',
  'public.expert_documents.expert_documents_delete_own',
  'public.expert_documents.expert_documents_insert_own',
  'public.expert_documents.expert_documents_select_own_or_admin',
  'public.expert_specializations.expert_specializations_owner_delete',
  'public.expert_specializations.expert_specializations_owner_insert',
  'public.expert_specializations.expert_specializations_owner_update',
  'public.expert_specializations.expert_specializations_select_all',
  'public.expert_verifications.expert_verifications_select_owner_or_admin',
  'public.experts.experts_insert_own',
  'public.experts.experts_select_verified_or_own_or_admin',
  'public.experts.experts_update_own_or_admin',
  'public.farm_crops.farm_crops_owner_delete',
  'public.farm_crops.farm_crops_owner_insert',
  'public.farm_crops.farm_crops_owner_update',
  'public.farm_crops.farm_crops_select_owner_or_admin',
  'public.farmer_profiles.farmer_profiles_owner_insert',
  'public.farmer_profiles.farmer_profiles_owner_update',
  'public.farmer_profiles.farmer_profiles_select_own_or_admin',
  'public.farms.farms_owner_delete',
  'public.farms.farms_owner_insert',
  'public.farms.farms_owner_update',
  'public.farms.farms_select_owner_or_admin',
  'public.idempotency_keys.idempotency_keys_owner_all',
  'public.inventory_alert_settings.inventory_alert_settings_delete_owner',
  'public.inventory_alert_settings.inventory_alert_settings_insert_owner',
  'public.inventory_alert_settings.inventory_alert_settings_select_owner',
  'public.inventory_alert_settings.inventory_alert_settings_update_owner',
  'public.inventory_locations.inventory_locations_delete_owner',
  'public.inventory_locations.inventory_locations_insert_owner',
  'public.inventory_locations.inventory_locations_select_owner',
  'public.inventory_locations.inventory_locations_update_owner',
  'public.inventory_movements.inventory_movements_select_owner',
  'public.inventory_products.inventory_products_delete_owner',
  'public.inventory_products.inventory_products_insert_owner',
  'public.inventory_products.inventory_products_select_owner',
  'public.inventory_products.inventory_products_update_owner',
  'public.inventory_purchase_items.inventory_purchase_items_select_owner',
  'public.inventory_purchases.inventory_purchases_delete_owner',
  'public.inventory_purchases.inventory_purchases_select_owner',
  'public.inventory_purchases.inventory_purchases_update_owner',
  'public.inventory_stock.inventory_stock_select_owner',
  'public.inventory_suppliers.inventory_suppliers_delete_owner',
  'public.inventory_suppliers.inventory_suppliers_insert_owner',
  'public.inventory_suppliers.inventory_suppliers_select_owner',
  'public.inventory_suppliers.inventory_suppliers_update_owner',
  'public.inventory_sync_log.inventory_sync_log_select_owner',
  'public.listing_views.listing_views_insert_authenticated',
  'public.listing_views.listing_views_select_owner_or_admin',
  'public.listings.listings_owner_delete',
  'public.listings.listings_owner_insert',
  'public.listings.listings_owner_update',
  'public.listings.listings_select_active_or_owner',
  'public.messages.messages_insert_participant',
  'public.messages.messages_select_participants',
  'public.messages.messages_update',
  'public.notifications.notifications_select_own',
  'public.notifications.notifications_update_own',
  'public.order_items.order_items_insert_buyer',
  'public.order_items.order_items_select_participants',
  'public.order_status_history.order_status_history_select_participants',
  'public.orders.orders_insert_buyer',
  'public.orders.orders_select_participants',
  'public.orders.orders_update_participants',
  'public.payment_transactions.payment_transactions_select',
  'public.payments.payments_insert_buyer',
  'public.payments.payments_select_order_participants',
  'public.payments.payments_update_order_seller',
  'public.profiles.profiles_select_own_or_admin',
  'public.profiles.profiles_update_own_or_admin',
  'public.reports.reports_admin_update',
  'public.reports.reports_insert_reporter',
  'public.reports.reports_select_own_or_admin',
  'public.required_documents.required_documents_admin_insert',
  'public.required_documents.required_documents_admin_update',
  'public.required_documents.required_documents_select_authenticated',
  'public.reviews.reviews_admin_update',
  'public.reviews.reviews_insert_buyer_completed_order_or_consultation',
  'public.reviews.reviews_select_all',
  'public.units.units_admin_delete',
  'public.units.units_admin_insert',
  'public.units.units_admin_update',
  'public.units.units_select_all',
  'storage.objects.avatars_owner_delete',
  'storage.objects.avatars_owner_update',
  'storage.objects.avatars_owner_write',
  'storage.objects.avatars_public_read',
  'storage.objects.consultation_attachments_participant_insert',
  'storage.objects.consultation_attachments_select_participants',
  'storage.objects.dealer_documents_owner_delete',
  'storage.objects.dealer_documents_owner_or_admin_read',
  'storage.objects.dealer_documents_owner_write',
  'storage.objects.disease_images_owner_or_admin_read',
  'storage.objects.disease_images_owner_update',
  'storage.objects.disease_images_owner_write',
  'storage.objects.expert_documents_owner_delete',
  'storage.objects.expert_documents_owner_or_admin_read',
  'storage.objects.expert_documents_owner_write',
  'storage.objects.inventory_exports_owner_read',
  'storage.objects.listing_images_owner_delete',
  'storage.objects.listing_images_owner_update',
  'storage.objects.listing_images_owner_write',
  'storage.objects.listing_images_public_read',
  'storage.objects.message_attachments_participant_insert',
  'storage.objects.message_attachments_select_participants'
  ],
  'policy inventory: 139 policies, each with cases in 02_* to 05_* or its migration''s test file');

select * from finish();
rollback;
